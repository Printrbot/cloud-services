// Rendering service
// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var AWS = require('aws-sdk')
  , ac = require('./config/aws')
  , http = require('http')
  , fs = require('fs')
  , hat = require('hat')
  , temp = '/tmp/'
  , exec = require('child_process').exec
  , Promise = require('bluebird')
  , Jimp = require('jimp')
  , ImageTools = require('./util/image_tools')
  , MessageQueue = require('./util/message_queue')
  , FileRepo = require('./util/file_repo')



var sqs = new AWS.SQS();

function runLoop() {
  MessageQueue.poolMessage(ac.sqs_render)
  .then(processMessage)
  .then(runLoop)
  .catch(function(err) {
    console.info("ERROR: ", err);
    return runLoop();
  })
}

function renderPreview(stl_path)
{
  return new Promise(function(resolve, reject) {
    var cmd = "blender -b render.blend -P run.py -- "+stl_path+ " " +stl_path+ ".png";
    if (process.platform == "darwin") {
      var cmd = "/Applications/Blender/blender.app/Contents/MacOS/" + cmd;
    }
    exec(cmd, {maxBuffer: 1024*1000}, function callback(err, stdout, stderr) {
      if (err) {
        console.info("error", err);
        reject(err)
      } else {
        resolve(stl_path+'.png');
      }
    });
  })
}

function processMessage(res) {

  return new Promise(function(resolve, reject) {
    if (!res.Messages)
      return reject(new Error('empty message'));

    var message = res.Messages[0]
      , file_info = JSON.parse(message.Body)
      , file_path = temp + file_info._id
      , s3uploadpath = 'u/'+file_info.user+'/i/'+file_info._id+'/';



    if (file_info.file_path.split("/").pop().split(".").pop().toLowerCase() != 'stl') {
      console.info("INVALID FILE TYPE");
      return MessageQueue.deleteRenderRequestMessage(message.ReceiptHandle)
      .then(function(r) {
        return resolve()
      })
    } else {
      FileRepo.downloadFromS3(file_info.file_path)
      .then(function(file_path) {
        // render image
        return renderPreview(file_path);
      })
      .then(function(file_path) {
        console.info("CREATING SIZES")
        ImageTools.createAllSizes(file_path)
        .then(function(j) {
          var _f = j[0].split("/").pop();
          return FileRepo.uploadToS3(j[0], 'img/png', s3uploadpath+_f)
          .then(function(preview) {
            return [j, preview];
          })
        })
        .spread(function(j, preview) {
          var _f = j[1].split("/").pop();
          return FileRepo.uploadToS3(j[1], 'img/png', s3uploadpath+_f)
          .then(function(thumb) {
            return [j, preview, thumb];
          })
        })
        .spread(function(j, preview, thumb) {
          var _f = j[2].split("/").pop();
          return FileRepo.uploadToS3(j[2], 'img/png', s3uploadpath+_f)
          .then(function(raw) {
            return [j, preview, thumb, raw];
          })
        })
        .spread(function(j, preview, thumb, raw ) {
          // send message that we are done
          console.info("ALL DONE, SEND COMPLETE MESSAGE");
          file_info.thumbnail = thumb.Location;
          file_info.rawimage = raw.Location;
          file_info.preview = preview.Location;
          MessageQueue.sendRenderCompleteMessage(file_info)
          .then(MessageQueue.deleteRenderRequestMessage(message.ReceiptHandle))
          .then(function(r) {
            resolve();
          })
        })
      });
    }
  })
}

runLoop();
