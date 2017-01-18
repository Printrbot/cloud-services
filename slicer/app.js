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
    console.info("ERROR: ", err);
    return runLoop();
  })
}

function runSlicer(configFile, stl, gcodeFilePath) {
  return new Promise(function(resolve, reject) {
    console.info('-- SLICE');
    var cmd = "CURA_ENGINE_SEARCH_PATH=./ ./"+CuraEngine+" slice -v -j "+configFile+" -l "+stl;
    cmd += " -s mesh_position_z=\"0\" -s center_object=\"true\"";
    cmd += " -o "+gcodeFilePath;
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


function buildSimpleConfig(inFilePath, outFilePath,  params) {
  return new Promise(function(resolve, reject) {
    var jsonConfig = require(inFilePath);

    // resolution
    switch(params.resolution) {
      case 'low':
        jsonConfig.overrides.layer_height = { "default_value": 0.2 };
        break;

      case 'standard':
        jsonConfig.overrides.layer_height = { "default_value": 0.1 };
        break;

      case 'high':
        jsonConfig.overrides.layer_height = { "default_value": 0.05 };
        break;
    }

    // infill
    switch(params.infill) {
      case 'hollow':
        jsonConfig.overrides.infill_line_distance = { "default_value": 0 };
        break;

      case 'light':
        jsonConfig.overrides.infill_line_distance = { "default_value": 5 };
        break;

      case 'standard':
        jsonConfig.overrides.infill_line_distance = { "default_value": 2 };
        break;

      case 'medium':
        jsonConfig.overrides.infill_line_distance = { "default_value": 1 };
        break;

      case 'heavy':
        jsonConfig.overrides.infill_line_distance = { "default_value": .5 };
        break;

      case 'solid':
        jsonConfig.overrides.infill_line_distance = { "default_value": 100 };
        break;
    }

    // support
    if (params.support)
      jsonConfig.overrides.support_enable = { "default_value": true };

    // brim
    if (params.brim)
      jsonConfig.overrides.adhesion_type = { "default_value": "Brim" };

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
      , keyPath = 'u/'+(event.user)+'/i/'+(event.id)+'/'
      , stlFilePath = "/tmp/obj_"+(event.id)+".stl"
      , bucket = 'files.printrapp.com'
      , configDefault = './simple.json'
      , configOut = '/tmp/config_'+(event.id)+'.json'
      , gcodeFilePath = '/tmp/out_'+(event.id)+'.gco'

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
