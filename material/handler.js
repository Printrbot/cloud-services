// Material file builder
// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var Promise = require('bluebird')
  , fs = Promise.promisifyAll(require("fs"))
  , _ = require('underscore')
  , AWS = require('aws-sdk');

// add timestamps in front of log messages
require('console-stamp')(console, 'yyyy-mm-dd HH:MM:ss.l');

/* AWS */
const AWS_S3_BUCKET = 'test-files.printrapp.com';
const AWS_REGION = "us-west-2";

AWS.config.region = AWS_REGION;
var s3 = new AWS.S3();

const MATLIB_HEADER_LENGTH = 34;
const MATLIB_SIGNATURE = 'F34C5F98685A4D1AA868D58C88122443';
const MATLIB_V1_VERSION = 1;
const MATLIB_V1_FILENAME = "matlib";

/* v1 material entry fields */
const MATLIB_V1_NAME_LEN = 32;
const MATLIB_V1_TYPE_LEN = 12;
const MATLIB_V1_BRAND_LEN = 32;
const MATLIB_V1_TEMP_LEN = 2;
const MATLIB_V1_SPEED_LEN = 2;
const MATLIB_V1_RETRACTION_LEN = 1;
const MATLIB_V1_MATERIAL_LEN = (
  MATLIB_V1_NAME_LEN + MATLIB_V1_TYPE_LEN + MATLIB_V1_BRAND_LEN +
  MATLIB_V1_TEMP_LEN + MATLIB_V1_SPEED_LEN + MATLIB_V1_RETRACTION_LEN
);

/**
 * Main entry point
 */
module.exports.buildindex = function(materials, context, cb) {
  // Ensure that the specified materials record is valid before proceeding
  var err = validateMaterialsRecord(materials);
  if (err != null) {
    console.log("Invalid materials record: " + err);
    cb(err);
  }

  // Upload matlib v1
  v1UploadParams = createV1Matlib(materials);
  console.info("Finished preparing matlib (v1), uploading file to S3: params=" + v1UploadParams);
  var s3bucket = new AWS.S3();
  s3bucket.upload(v1UploadParams, function(err, data) {
    if (err) {
      console.log("Error uploading matlib (v1): " + err.message);
      cb(err, null)
    } else {
      console.log("Finished uploading matlib (v1)");
      cb(null, data);
    }
  });
}

/**
 * Create matlib v1 file
 */
module.exports.createV1Matlib = function(materials) {
  console.log("Building matlib (v1) from materials record: " + JSON.stringify(materials));
  var v1Header = createV1Header(materials.materials.length);
  var v1Materials = createV1Materials(materials);
  return {
    Bucket: AWS_S3_BUCKET,
    Key:  'u/' + (materials.user) + '/data/' + MATLIB_V1_FILENAME,
    Body: Buffer.concat([v1Header, v1Materials]),
    ACL: 'public-read',
    ContentType: 'application/octet-stream'
  };
}

/**
 * Returns null if the specified materials record is valid. Otherwise, returns an error message
 */
function validateMaterialsRecord(materials) {
  if (!materials._id) {
    return "materials._id missing";
  }

  return null;
}

/**
 * Create and return standard matlib file header with the specified material count
 */
function createV1Header(materialsCount) {
  var header = new Buffer(MATLIB_HEADER_LENGTH);
  header.fill(0);
  header.write(MATLIB_SIGNATURE, 0, 32);
  header.writeInt8(MATLIB_V1_VERSION, 32);
  header.writeInt8(materialsCount, 33);
  return header;
}

/**
 * Map each material entry to a byte-packed record, then return a buffer containing each
 * record concatenated one after the other
 */
function createV1Materials(materials) {
    return materials.materials.map(function(material, k) {
        var entry = new Buffer(MATLIB_V1_MATERIAL_LEN);
        entry.fill(0);
        entry.write(material.name.toUpperCase(), 0, 32);
        entry.write(material.type, 32, 44);
        entry.write(material.brand, 44, 76);
        entry.writeUInt16LE(material.print_temperature, 76);
        entry.writeUInt16LE(material.speed * 100, 78);
        entry.writeUInt8(material.retraction ? 1 : 0, 80);
        return entry;
    })
    .reduce(function(accumulator, value) {
        return (accumulator == null) ? value : Buffer.concat([accumulator, value]);
    }, null);
}
