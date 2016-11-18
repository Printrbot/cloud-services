// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var exec = require('child_process').exec
  , AWS = require('aws-sdk')
  , hat = require('hat')
  , ac = require('../config/aws')
  , Promise = require('bluebird')

AWS.config.update({region: ac.region});

module.exports.sendRenderCompleteMessage = function(item)
{
  console.info("SENDING RENDER COMPLETE MESSAGE", item)
  return new Promise(function(resolve, reject) {
    var sqs = new AWS.SQS();
    var rparams = {
      MessageBody: JSON.stringify(item),
      QueueUrl: ac.sqs_render_completed,
      DelaySeconds: 0
    };
    sqs.sendMessage(rparams, function(err, data) {
      if (err) reject(err);
      else resolve(data);
    });
  })
}


module.exports.deleteRenderRequestMessage = function(receipt)
{
  return new Promise(function(resolve, reject) {
    var sqs = new AWS.SQS();
    sqs.deleteMessage({
      QueueUrl: ac.sqs_render,
      ReceiptHandle: receipt
    }, function(err, res) {
      if (err) reject(err);
      else resolve(res);
    });
  });
}


module.exports.poolMessage = function(queue_url) {
  var params = {
    QueueUrl: queue_url,
    MaxNumberOfMessages: 1,
    VisibilityTimeout: 30,
    WaitTimeSeconds: 20
  };
  console.info("POOLING");
  var sqs = new AWS.SQS();
  return new Promise(function(resolve, reject) {
    sqs.receiveMessage(params, function(err, res) {
      console.info("GOT IT");
      if (err) reject(err);
      else resolve(res);
    });
  })
}
