// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var exec = require('child_process').exec
    , AWS = require('aws-sdk')
    , hat = require('hat')
    , ac = require('../config/aws')
    , Promise = require('bluebird')
    , fs = Promise.promisifyAll(require("fs"))
    , http = require('http');

const TEMP_DIR = '/tmp/render/';

AWS.config.update({region: 'us-west-2'});

var s3 = new AWS.S3({params: {Bucket: ac.bucket}});
Promise.promisifyAll(Object.getPrototypeOf(s3));

module.exports.deleteFiles = function(files) {
    console.info(`Deleting files from S3: ${files}`);
    return new Promise(function(resolve, reject) {
        var s3 = new AWS.S3();
        var params = {
            "Bucket": ac.bucket,
            "Delete": {
                "Objects": files
            }
        };
        s3.deleteObjects(params, function(err, data) {
            if (err) {
                reject(err);
            }
            resolve(data);
        });
    });
};

module.exports.uploadToS3 = function(localFile, contentType, s3UploadPath) {
    return new Promise(function(resolve, reject) {
        fs.readFileAsync(localFile)
            .then(function(data) {
                var params = {
                    Key: s3UploadPath,
                    Body: data,
                    ACL: 'public-read',
                    ContentType: contentType
                };
                console.info(`Uploading to S3: localFile=${localFile} s3UploadPath=${s3UploadPath} contentType=${contentType}`);
                return s3.uploadAsync(params);
            })
            .then(function(floc) {
                console.info(`Deleting local file: ${localFile}`);
                return fs.unlinkAsync(localFile)
                    .then(function () {
                        return resolve(floc);
                    });
            }).catch(function(err) {
                console.info(`Failed to upload file to S3: ${err}`);
            });
        }
    );
};

module.exports.downloadFromS3 = function(key) {
    fs.accessSync(TEMP_DIR);
    return new Promise(function(resolve, reject) {
        var file_path = TEMP_DIR + key.substring(key.lastIndexOf("/") + 1);
        var tempFile = require('fs').createWriteStream(file_path);
        var params = { Bucket: ac.bucket, Key: key };
        var s3 = new AWS.S3();

        console.info(`Downloading: (S3) ${key} => (local) ${file_path}`);
        s3.getObject(params)
            .createReadStream()
            .pipe(tempFile)
            .on('finish', function() {
                resolve(file_path);
            });
    });
};

module.exports.downloadFile = function(url, file_path) {
    return new Promise(function(resolve, reject) {
        var f = fs.createWriteStream(file_path);
        console.info(`Downloading (S3) ${url} => (local) ${file_path}`);
        http.get(url.replace("https://", "http://"), function(res) {
            res.pipe(f);
            f.on('finish', function() {
                console.info('Download completed');
                f.close(resolve(file_path));
            });
        }).on('error', function(err) {
            console.error(`Failed to download file from S3: ${err}`);
            fs.unlink(file_path, function (err) {
                if (err) {
                    console.error(`Failed to delete local file: ${err}`);
                } else {
                    console.log('Temporary file deleted');
                }
            });
            reject(err);
        });
    });
};
