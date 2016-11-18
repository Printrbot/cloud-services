// Project index builder
// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var Jimp = require('jimp')
  , Promise = require('bluebird')
  , fs = Promise.promisifyAll(require("fs"))
  , _ = require('underscore')
  , hat = require('hat')
  , bucket = 'files.printrapp.com'
  , AWS = require('aws-sdk')


AWS.config.region = 'us-west-2';
var s3 = new AWS.S3()

function getBitmapBuffer(thumb_key) {
  return new Promise(function(resolve, reject) {
    var params = {
      Bucket: bucket,
      Key: thumb_key
    };
    var f = "/tmp/" + hat() + '.png';
    var tmp_file = require('fs').createWriteStream(f, {autoClose: true});
    var fs = s3.getObject(params).createReadStream().pipe(tmp_file);

    fs.on('close', function(){
      var buf = new Buffer((240*270)*2);
      var c = 0;
      Jimp.read(f).then(function (image) {
        image.cover(270,240)
        .dither565();
        console.info("got shit");
        for (var x=0;x<image.bitmap.width;x++) {
          for (var y=0;y<image.bitmap.height;y++) {
            var b = image.getPixelColor(x,y);
            var rgba = Jimp.intToRGBA(b);
            var _p = rgba.r << 8 | rgba.g << 3 | rgba.b >> 3;
            buf.writeUInt16LE(_p, c, 2);
            c+=2;
            //console.info('...');
          }
        }
        console.info("resolving");
        resolve(buf);
      }).catch(function(err) {
        reject(err);
      });
    });
  })
}

var streamProjectIndex = function(project) {
  console.info("PROJECT:");
  console.info(project);

  return new Promise(function(resolve, reject) {

    var finalBuffer = new Buffer(0);

    // write the project file id to temp buffer
    var pb = new Buffer(75)
      , name = project.name.toUpperCase();


    pb.fill(0);
    // unique id for project index file format
    pb.write('76E2F144D377463FBF4CB0B40753C78C' 0, 32);
    // project format
    pb.writeInt8(0,1);
    // project idx
    pb.write(project.idx, 33, 8);
    // project rev
    pb.writeInt8(project._rev.split("-")[0], 41);
    // project name
    pb.write(name, 42, 32);
    // total jobs
    pb.writeInt8(project.items.length, 74);
    // image buffer
    var b = new Buffer((240*270)*2);
    getBitmapBuffer(project.thumbnail.split("files.printrapp.com/")[1])
    .then(function(_b) {
      finalBuffer = Buffer.concat([pb, _b]);
      return;
    })
    .then(function() {
      var jtasks = project.items.map(function(item, k) {
        return new Promise(function(resolve, reject) {
          var bs = 11+32+256 // idx + name + url
            , ji = new Buffer(bs)
            , name = item.name.toUpperCase();

          ji.fill(0);
          // job idx
          ji.write(item.idx, 0, 8);
          // job rev
          ji.write(item._rev.split("-")[0], 9, 1);
          // times printed - default 0, this value is updated on printer
          ji.write("0", 10, 1);
          // job name
          ji.write(name, 11, 32);
          ji.write("http://files.printrapp.com/u/" + item.user + "/i/" + item._id + "/" + item._id + ".gco", 43);

          getBitmapBuffer(item.thumbnail.split("files.printrapp.com/")[1])
          .then(function(_b) {

            finalBuffer = Buffer.concat([finalBuffer, ji, _b]);

            resolve()
          })
          .catch(function(err) {
            console.info(err);
            reject(err);
          })
        });
      });

      Promise.all(jtasks).then(function() {
        var params = {
          Bucket: bucket,
          Key:  'u/'+(project.user)+'/p/'+(project._id)+'/' + (project.idx),
          Body: finalBuffer,
          ACL: 'public-read',
          ContentType: 'Application/octet-stream'
        }
        console.info(params)
        var s3bucket = new AWS.S3({params: { Bucket: bucket }});
        s3bucket.upload(params, function(err, sres) {
          if (err) {
            console.info("ERROR: ", err);
          } else {
            console.info(sres);
          }
        });
      });
    });
  });
};

var importPreviewImage = function(data) {
  return new Promise(function(resolve, reject) {
    reject('not implemented')
  });
}

module.exports.buildindex = function(event, context, cb) {
  streamProjectIndex(event).then(
    function(res) {
      cb(null, res);
    }
  )
}

module.exports.importPreview = function(event, context, cb) {
  importPreviewImage(event).then(
    function(res) {
      cb(null, res);
    }
  )
}
