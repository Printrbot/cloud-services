(function () {
   'use strict';
}());

var exec = require('child_process').exec
  , AWS = require('aws-sdk')
  , Promise = require('bluebird')
  , fs = require("fs");

AWS.config.region = 'us-west-2';

function downloadOriginal(filePath, params) {
  console.info("-- DOWNLOADING GCODE ", params);
  return new Promise(function(resolve, reject) {
    var file = fs.createWriteStream(filePath);
    file.on("open", function() {
      var s3 = new AWS.S3();
      s3.getObject(params)
      .on('httpData', function(chunk) { 
        file.write(chunk);
      })
      .on('httpDone', function() {
        file.end();
        resolve();
      })
      .send();
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

function runFixer(configFile) {
  return new Promise(function(resolve, reject) {
    console.info('-- FIX GCODE');
    exec("cp postprocess.py /tmp/postprocess.py; /tmp/postprocess.py", function callback(err, stdout, stderr) {
      if (err) {
        reject(err);
      } else {
        console.info(stdout);
        console.info(stderr);
        resolve();
      }
    });
  });
}

function writeGcodeHeader(inFilePath, event) {
  console.info("-- WRITING GCODE HEADER ");
  return new Promise(function(resolve, reject) {
    // first read line count
    getLinesCount(inFilePath)
    .then(function(lineCount) {

      var head = {
        "time": null,
        "readable": null,
        "volume": null,
        "filament": null,
        "resolution": null,
        "infill": null,
        "brim": null,
        "lines": lineCount
      };

      var hs = ";" + JSON.stringify(head);

      // write to file
      exec('echo -e "'+(hs.replace(/"/g, '\\"').replace("\n", ""))+'\n$(cat '+inFilePath+')" > '+inFilePath, function callback(err, stdout, stderr) {
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

function getLinesCount(filePath) {
  return new Promise(function(resolve, reject) {
    exec("sed -n '$=' "+filePath, function callback(err, stdout, stderr) {
      console.info("-- TOTAL LINES: ", stdout);
      resolve(stdout.trim());
    });
  })
}

module.exports.fix = function(event, context, cb) {

  if (!event.id || !event.file_path || !event.user)
    return cb("Required parameters missing");

  var s3 = new AWS.S3()
    , key_path = 'u/'+(event.user)+'/i/'+(event.id)+'/'
    , original_file_path = "/tmp/original.gco"
    , bucket = 'files.printrapp.com'
    , gcodeFilePath = '/tmp/out.gco'

  // download original
  downloadOriginal(original_file_path, { Bucket: bucket, Key: event.file_path })
  .then(function() {
    return runFixer();
  })
  .then(function() {
    // inject info header into gcode
    return writeGcodeHeader(gcodeFilePath, event);
  })
  .then(function() {
    // upload gcode
    return uploadFile(gcodeFilePath, bucket, key_path + (event.id) + '.gco')
  })
  .then(function(s3res) {
    // finish
    cb(null, {message: s3res});
  })
  .catch(function(err) {
    // log error
    console.error(err);
    cb(err, null)
  })

};
