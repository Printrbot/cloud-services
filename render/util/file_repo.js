// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var exec = require('child_process').exec
  , AWS = require('aws-sdk')
  , hat = require('hat')
  , ac = require('../config/aws')
  , temp = '/tmp/'
  , Promise = require('bluebird')
  , fs = Promise.promisifyAll(require("fs"))
  , http = require('http')

AWS.config.update({region: 'us-west-2'});


var s3 = new AWS.S3({params: {Bucket: ac.bucket}});
Promise.promisifyAll(Object.getPrototypeOf(s3));

module.exports.deleteFiles = function(files)
{
  return new Promise(function(resolve, reject) {
    var s3 = new AWS.S3();
    var params = {
      "Bucket": ac.bucket,
      "Delete": {
        "Objects": files,
      }
    };
    s3.deleteObjects(params, function(err, data) {
      if (err) reject(err);
      resolve(data);
    });
  });
}


module.exports.uploadToS3 = function(file_path, content_type, s3uploadpath)
{
  console.info("UPLOADING", file_path, content_type, s3uploadpath);

  return new Promise(function(resolve, reject) {
    fs.readFileAsync(file_path)
    .then(function(data) {
    // upload to s3
      var params = {
        Key: s3uploadpath,
        Body: data,
        ACL: 'public-read',
        ContentType: content_type
      }
      console.info("UPLOADING");
      return s3.uploadAsync(params);
    })
    .then(function(floc) {
      // remove local file
      return fs.unlinkAsync(file_path)
      .then(function () {
        console.info("DONE DELETING", floc);
        return resolve(floc);
      })
    }).catch(function(err) {
      console.info("ERROR:", err);
    })
  });
}

module.exports.downloadFromS3 = function(key) {
  return new Promise(function(resolve, reject) {
    var file_path = "/tmp/" + hat();
    var _file = require('fs').createWriteStream(file_path);
    var params = { Bucket: ac.bucket, Key: key };

    var s3 = new AWS.S3()
    s3.getObject(params)
    .on('httpData', function(chunk) {
      _file.write(chunk);
    })
    .on('httpDone', function() {
      _file.end();
      resolve(file_path);
    })
    .send();
  })
}

module.exports.downloadFile = function(url, file_path) {

  return new Promise(function(resolve, reject) {
    var f = fs.createWriteStream(file_path);
    console.info("URL", url);
    console.info("PATH", file_path)
    http.get(url.replace("https://", "http://"), function(res) {
      res.pipe(f);
      f.on('finish', function() {
        console.info('FINISHED DOWNLOADING FILE');
        f.close(resolve(file_path));
      });
    }).on('error', function(err) {
      fs.unlink(file_path, function (err) {
        if (err) {
          console.error(err);
        }
        console.log('Temp stl Deleted');
      });
      reject(err);
    });
  })
}
