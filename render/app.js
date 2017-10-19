// Rendering service
// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

require('console-stamp')(console, 'yyyy-mm-dd HH:MM:ss.l');

var AWS = require('aws-sdk')
    , ac = require('./config/aws')
    , exec = require('child_process').exec
    , Promise = require('bluebird')
    , ImageTools = require('./util/image_tools')
    , MessageQueue = require('./util/message_queue')
    , FileRepo = require('./util/file_repo');

const TEMP_DIR = '/tmp/';
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

/**
 * Main program loop. Receive and process the next message from the queue, then repeat.
 */
function runLoop() {
    MessageQueue.poolMessage(ac.sqs_render)
        .then(processMessage)
        .then(runLoop)
        .catch(function(err) {
            console.error(`An error occurred while processing render request: ${err}`);
            return runLoop();
        }
    );
}

function renderPreview(stlPath) {
    return new Promise(function(resolve, reject) {
        var outputFile = stlPath + ".png";
        var cmd = "blender -b render.blend -P run.py -- " + stlPath + " " + outputFile;

        // Path hack when running locally (Mac only)
        if (process.platform == "darwin") {
            var cmd = "/Applications/Blender/blender.app/Contents/MacOS/" + cmd;
        }

        // Execute render process as a shelled process
        console.info(`Rendering preview image with command: ${cmd}`);
        exec(cmd, {maxBuffer: MAX_BUFFER_SIZE}, function callback(err, stdOut, stdErr) {
            if (err) {
                console.error(`Failed to render preview image: ${err}`);
                console.error(`Standard output: ${stdOut}`);
                console.error(`Standard error: ${stdErr}`);
                reject(err)
            } else {
                console.info(`Render completed: outputFile=${outputFile}`);
                resolve(outputFile);
            }
        });
    });
}

/**
 * Processes the specified queue message. Note that it is assumed there is only one message in
 * the specified data. If there are multiplate, only the first will be processed.
 */
function processMessage(data) {
    return new Promise(function(resolve, reject) {
        if (!data.Messages) {
            return resolve();
        }

        var message = data.Messages[0]
            , file_info = JSON.parse(message.Body)
            , file_path = TEMP_DIR + file_info._id
            , s3uploadpath = 'u/' + file_info.user + '/i/' + file_info._id + '/';

        // If the file extension is not .stl, skip image rendering altogether
        if (file_info.file_path.split("/").pop().split(".").pop().toLowerCase() != 'stl') {
            console.info(`Skipping preview image rendering for unsupported file type: ${file_info.file_path}`);
            return MessageQueue.deleteRenderRequestMessage(message.ReceiptHandle)
                .then(function(r) {
                    return resolve();
                }
            );
        } else {
            FileRepo.downloadFromS3(file_info.file_path)
                .then(function(file_path) {
                    return renderPreview(file_path);
                })
                .then(function(file_path) {
                    console.info("Creating multiple sizes for primary, thumbnail, Printrhub preview");
                    ImageTools.createAllSizes(file_path)
                        .then(function(j) {
                            var _f = j[0].split("/").pop();
                            return FileRepo.uploadToS3(j[0], 'img/png', s3uploadpath + _f)
                                .then(function(preview) {
                                    return [j, preview];
                                }
                            );
                        })
                        .spread(function(j, preview) {
                            var _f = j[1].split("/").pop();
                            return FileRepo.uploadToS3(j[1], 'img/png', s3uploadpath + _f)
                                .then(function(thumb) {
                                    return [j, preview, thumb];
                                }
                            );
                        })
                        .spread(function(j, preview, thumb) {
                            var _f = j[2].split("/").pop();
                            return FileRepo.uploadToS3(j[2], 'img/png', s3uploadpath + _f)
                                .then(function(raw) {
                                    return [j, preview, thumb, raw];
                                }
                            );
                        })
                        .spread(function(j, preview, thumb, raw) {
                            file_info.thumbnail = thumb.Location;
                            file_info.rawimage = raw.Location;
                            file_info.preview = preview.Location;
                            console.info(`Sending render complete message: thumbnail=${file_info.thumbnail}, rawimage=${file_info.rawimage} preview=${file_info.preview}`);

                            MessageQueue.sendRenderCompleteMessage(file_info)
                                .then(MessageQueue.deleteRenderRequestMessage(message.ReceiptHandle))
                                .then(function(r) {
                                    resolve();
                                }
                            );
                        });
                    }
                );
            }
        }
    );
}

runLoop();
