var exec = require('child_process').exec
  , AWS = require('aws-sdk')
  , hat = require('hat')
  , ac = require('../config/aws')
  , Promise = require('bluebird')

AWS.config.update({region: ac.region});

module.exports.sendCompleteMessage = function(item)
{
  return new Promise(function(resolve, reject) {
    var sqs = new AWS.SQS();
    var rparams = {
      MessageBody: JSON.stringify(item),
      QueueUrl: ac.sqs_completed,
      DelaySeconds: 0
    };

    sqs.sendMessage(rparams, function(err, data) {
      if (err) reject(err);
      else resolve(data);
    });
  })
}


module.exports.deleteRequestMessage = function(receipt)
{
  return new Promise(function(resolve, reject) {
    var sqs = new AWS.SQS();
    sqs.deleteMessage({
      QueueUrl: ac.sqs_run,
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
  var sqs = new AWS.SQS();
  return new Promise(function(resolve, reject) {
    sqs.receiveMessage(params, function(err, res) {
      if (err) reject(err);
      else resolve(res);
    });
  })
}
