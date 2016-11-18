// Material file builder
// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var Promise = require('bluebird')
  , fs = Promise.promisifyAll(require("fs"))
  , _ = require('underscore')
  , bucket = 'files.printrapp.com'
  , AWS = require('aws-sdk')


AWS.config.region = 'us-west-2';
var s3 = new AWS.S3()

module.exports.buildindex = function(materials, context, cb) {

  if (!materials._id) cb("Invalid data submitted");

  var pb = new Buffer(34)

  pb.fill(0);
  pb.write('F34C5F98685A4D1AA868D58C88122443', 0, 32);
  pb.writeInt8(materials._rev.split("-")[0], 32);
  pb.writeInt8(materials.materials.length, 33);


  var mtasks = materials.materials.map(function(material, k) {
    return new Promise(function(resolve, reject) {
      var bs = 32+12+32+2+2+1 // name + type + brand + temperature + speed + retraction
        , ji = new Buffer(bs)

        ji.fill(0);
        ji.write(material.name.toUpperCase(), 0, 32);
        ji.write(material.type, 32, 44);
        ji.write(material.brand, 44, 76);
        ji.writeUInt16LE(material.print_temperature, 76);
        ji.writeUInt16LE(material.speed * 100, 78);
        ji.writeUInt8(material.retraction ? 1 : 0, 80);
        resolve(ji);
    });
  });

  Promise.reduce(mtasks, function(b, m) {
    return (b==null) ? m : Buffer.concat([b, m]);
  }, null)
  .then(function(buf) {
    console.info("DONE, writing final buffer");
    pb = Buffer.concat([pb, buf]);

    // upload final buffer to amazon
    var params = {
      Bucket: bucket,
      Key:  'u/'+(materials.user)+'/data/matlib',
      Body: pb,
      ACL: 'public-read',
      ContentType: 'Application/octet-stream'
    }
    console.info(params)
    var s3bucket = new AWS.S3({params: { Bucket: bucket }});
    s3bucket.upload(params, function(err, sres) {
      if (err) {
        cb(err, null)
      } else {
        cb(null, sres);
      }
    });

  });
}
