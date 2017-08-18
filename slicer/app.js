var AWS = require('aws-sdk')
  , ac = require('./config/aws.json')
  , https = require('https')
  , fs = require('fs')
  , temp = '/tmp/'
  , exec = require('child_process').exec
  , Promise = require('bluebird')
  , MessageQueue = require('./util/message_queue.js')
  , FileRepo = require('./util/file_repo.js');

var sqs = new AWS.SQS();
var CuraEngine = /darwin/.test(process.platform) ? 'CuraEngine_darwin' : 'CuraEngine';

function runLoop() {
  MessageQueue.poolMessage(ac.sqs_run)
  .then(sliceStl)
  .then(runLoop)
  .catch(function(err) {
    console.info("ERROR: " + err);
    return runLoop();
  })
}

function runSlicer(configFile, stl, gcodeFilePath) {
  return new Promise(function(resolve, reject) {
    console.info('-- SLICE');
    var cmd = "CURA_ENGINE_SEARCH_PATH=./ ./" + CuraEngine + " slice -v -j " + configFile + " -l " + stl;
    cmd += " -s mesh_position_z=\"0\" -s center_object=\"true\"";
    cmd += " -o " + gcodeFilePath;
    console.info(cmd);
    exec(cmd, function callback(err, stdout, stderr) {
      if (err) {
        console.info("SLICING FAILED, ", err)
        reject(err);
      } else {
        console.info(stderr);
        console.info(stdout);
        // cura writes output to stderr for some reason...
        resolve(stderr);
      }
    });
  });
}

var resolutionConfig = {
  'low': 0.2,
  'standard': 0.1,
  'high': 0.05
};

var infillConfig = {
  'hollow': 0.0,
  'sparse': 10.0,
  'standard': 20.0,
  'dense': 30.0,
  'solid': 70.0,
  /* Deprecated, retained for backward compatibility */
  'light': 10.0,
  'medium': 20.0,
  'heavy': 50.0
}

// Factor applied to layer_height to determine infill_line_width. For example, with a multiplier of
// 3.0 and a layer_height of 0.2, we would set infill_line_width to 0.6
var infillLineWidthMultiplier = 3.0;

// Additional factor applied in the formula to calculate infill_line_distance, based on the default
// selection of the "grid" infill pattern. Selection of an alternative infill pattern isn't currently
// exposed but we might want to use a different value here if it were. See fdmprinter.def.json for
// more info.
var infillPatternMultiplier = 2.0;

/**
 * Set CuraEngine overrides based on print settings parameters.
 */
function buildSimpleConfig(inFilePath, outFilePath,  params) {
  return new Promise(function(resolve, reject) {
    var jsonConfig = require(inFilePath);

    // Set layer_height override. Default to standard resolution if not specified
    // or unknown value specified.
    var resolution = resolutionConfig[params.resolution];
    if (!resolution) {
      console.log("Unknown resolution specified: '" + params.resolution + "', defaulting to 'standard'");
      resolution = resolutionConfig.standard;
    }
    jsonConfig.overrides.layer_height = { "default_value": resolution };

    var infill_line_width = Math.round((infillLineWidthMultiplier * resolution * 100.0), 2) / 100.0;
    console.log("Calculated infill_line_width = " + infill_line_width + " (resolution = " + resolution
      + ", infillLineWidthMultiplier = " + infillLineWidthMultiplier + ")");

    // Calculate infill_line_distance override based on desired density. Default to
    // standard density if not specified or unknown value specified.
    var infill_sparse_density = infillConfig[params.infill];
    if (infill_sparse_density === null) {
      console.log("Unknown infill specified: '" + params.infill + "', defaulting to 'standard'");
      infill_sparse_density = infillConfig.standard;
    }
    console.log("infill_sparse_density =", infill_sparse_density);

    // Note that we're multiplying by 100, rounding, and then dividing by 100 again to get a value rounded
    // to 2 decimal places
    var line_distance = 0.0;
    if (infill_sparse_density > 0) {
        line_distance = ((infill_line_width * 100.0) / infill_sparse_density) * infillPatternMultiplier;
    }
    jsonConfig.overrides.infill_line_distance = { "default_value": Math.round(line_distance * 100, 2) / 100.0 }
    console.log("Calculated infill_line_distance =", jsonConfig.overrides.infill_line_distance.default_value);

    // Set support_enable override if support enabled. Default to false if not specified.
    if (params.support) {
      jsonConfig.overrides.support_enable = { "default_value": true };
    } else {
      jsonConfig.overrides.support_enable = { "default_value": false };
    }
    console.log("Print support:", jsonConfig.overrides.support_enable.default_value);

    // Set adhesion_type override to "brim" if brim enabled. Do not set if not specified.
    if (params.brim) {
      jsonConfig.overrides.adhesion_type = { "default_value": "brim" };
      jsonConfig.overrides.skirt_brim_line_width = { "default_value": "0.3" };
    } else {
      jsonConfig.overrides.adhesion_type = { "default_value": "" };
      jsonConfig.overrides.skirt_brim_line_width = { "default_value": "0" };
    }
    console.log("Adhesion type:", jsonConfig.overrides.adhesion_type.default_value);
    console.log("Brim line width:", jsonConfig.overrides.skirt_brim_line_width.default_value);

    // write config to file
    fs.writeFile(outFilePath, JSON.stringify(jsonConfig), 'utf8', function(err, res) {
      if (err)
        reject(err);
      else {
        resolve();
      }
    });
  });
}

function uploadFile(filePath, bucket, key) {
  console.info("-- UPLOADING FILE: ", key);
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, function(err, data) {
      if (err) {
        reject(err);
      } else {
        var params = {
          Bucket: bucket,
          Key: key,
          Body: data,
          ACL: 'public-read'
        };
        var s3bucket = new AWS.S3({"params": { Bucket: bucket }});
        s3bucket.upload(params, function(err, sres) {
          if (err) {
            reject(err);
          } else {
            resolve(sres);
          }
        });
      }
    });
  });
}

function getLinesCount(filePath) {
  return new Promise(function(resolve, reject) {
    exec("sed -n '$=' "+filePath, function callback(err, stdout, stderr) {
      console.info("-- TOTAL LINES: ", stdout);
      resolve(stdout.trim());
    });
  })
}

function writeGcodeHeader(inFilePath, slicerOut, event) {
  console.info("-- WRITING GCODE HEADER ");
  return new Promise(function(resolve, reject) {
    // first read line count
    getLinesCount(inFilePath)
    .then(function(lineCount) {
      var s = slicerOut.split("Print time: ")[1].split("\n")
        , t = s[1].split(" ")
        , v = s[2].split(" ")[1];

      var head = {
        "time": s[0],
        "readable": t[3]+" "+t[4],
        "volume": v,
        "filament": Math.round(v/(Math.pow((Math.PI*(1.75/2)), 2)))
      };

      function capitalize(s) {
        return s[0].toUpperCase() + s.slice(1);
      }

      head.lines = (lineCount);
      head.resolution = capitalize(event.resolution);
      head.support = event.support;
      head.infill = capitalize(event.infill);
      head.brim = event.brim;

      var hs = ";" + JSON.stringify(head);

      // write to file
      exec('echo "'+(hs.replace(/"/g, '\\"').replace("\n", ""))+'\n$(cat '+inFilePath+')" > '+inFilePath, function callback(err, stdout, stderr) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    })
    .catch(function(err) {
      reject(err);
    })
  });
}

function sliceStl(res) {

  return new Promise(function(resolve, reject) {

    console.info("IN SLICE STL ", res)
    if (!res.Messages)
      return reject('empty message');

    var message = res.Messages[0]
      , event = JSON.parse(message.Body)

    if (!event.id || !event.file_path || !event.user)
      return reject("Required parameters missing");

    var s3 = new AWS.S3()
      , keyPath = 'u/' + (event.user) + '/i/' + (event.id) + '/'
      , stlFilePath = "/tmp/obj_" + (event.id) + ".stl"
      , bucket = 'files.printrapp.com'
      , configDefault = './simple.json'
      , configOut = '/tmp/config_' + (event.id) + '.json'
      , gcodeFilePath = '/tmp/out_' + (event.id) + '.gco'

    // download stl
    FileRepo.downloadFromS3(event.file_path, stlFilePath)
      .then(function() {
        // build config file
        return buildSimpleConfig(configDefault, configOut, event);
      })
      .then(function() {
        // run slicer
        return runSlicer(configOut, stlFilePath, gcodeFilePath);
      })
      .then(function(slicerOut) {
        // inject info header into gcode
        return writeGcodeHeader(gcodeFilePath, slicerOut, event);
      })
      .then(function() {
        // upload gcode
        return uploadFile(gcodeFilePath, bucket, keyPath + (event.id) + '.gco')
      })
      .then(function(s3res) {
        // finish, send complete message
        console.info("DONE UPLOADING, SENDING FINISH MSG")
        MessageQueue.sendCompleteMessage(event)
          .then(MessageQueue.deleteRequestMessage(message.ReceiptHandle))
          .then(function(r) {
            return r
          })
      })
      .then(function(r) {
        // cleanup
        fs.unlinkSync(stlFilePath);
        fs.unlinkSync(configOut);
        fs.unlinkSync(gcodeFilePath);
        resolve()
      })
      .catch(function(err) {
        // log error
        console.error(err);
        reject(err);
      });
  })
}

runLoop();
