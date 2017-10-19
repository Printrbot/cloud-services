// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var exec = require('child_process').exec
    , AWS = require('aws-sdk')
    , hat = require('hat')
    , ac = require('../config/aws')
    , Promise = require('bluebird');

AWS.config.update({region: ac.region});

/**
 * Sends a message to the render request queue.
 */
module.exports.sendRenderCompleteMessage = function(item) {
    console.info(`Sending render completed message: ${item}`);
    return new Promise(function(resolve, reject) {
        var sqs = new AWS.SQS();
        var rparams = {
            MessageBody: JSON.stringify(item),
            QueueUrl: ac.sqs_render_completed,
            DelaySeconds: 0
        };
        sqs.sendMessage(rparams, function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

/**
 * Deletes a received message from the render request queue
 */
module.exports.deleteRenderRequestMessage = function(receipt) {
    return new Promise(function(resolve, reject) {
        var sqs = new AWS.SQS();
        console.info("Deleting render request from queue");
        sqs.deleteMessage({
            QueueUrl: ac.sqs_render,
            ReceiptHandle: receipt
        }, function(err, data) {
            if (err) {
                console.error(`Failed to delete render request: ${err}`);
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

/**
 * Returns a promise which receives the next message from the queue. The receiveMessage
 * call uses long polling and waits up to 20 seconds before returning if no messages are
 * available.
 */
module.exports.poolMessage = function(queue_url) {
    var params = {
        QueueUrl: queue_url,
        MaxNumberOfMessages: 1,
        VisibilityTimeout: 30,
        WaitTimeSeconds: 20
    };

    var sqs = new AWS.SQS();
    return new Promise(function(resolve, reject) {
        sqs.receiveMessage(params, function(err, data) {
            if (err) {
                console.error(`Failed to receive queue message: ${err}`);
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}
