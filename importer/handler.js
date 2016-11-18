// Thingiverse importer
// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var Jimp = require('jimp')
  , Promise = require('bluebird')
  , fs = Promise.promisifyAll(require("fs"))
  , _ = require('underscore')
  , bucket = 'files.printrapp.com'
  , AWS = require('aws-sdk')
  , http = require('follow-redirects').http
  , exec = require('child_process').exec

function importThing(event) {
  return new Promise(function(resolve, reject) {
    // download the file
    if (!event.url) reject('No url provided');
    if (!event.key) reject('No key provided');

    downloadFile(event.url.replace('https:', 'http:'), '/tmp/obj.stl')
    .then(function(file_path) {
      return getSize()
    })
    .then(function(s) {
      fs.readFile("/tmp/obj.stl", function(err, data) {
        if (err) {
          console.info("unable to read downloaded stl file!!!");
          reject(err);
        } else {
          console.info("FINISHED READING STL FILE");
          // upload it to s3
          var params = {
            Bucket: bucket,
            Key: event.key,
            Body: data,
            ACL: 'public-read'
          };
          console.info(params);
          console.info(data.length);
          var s3bucket = new AWS.S3({params: { Bucket: bucket }});
          s3bucket.upload(params, function(err, sres) {
            if (err) {
              reject(err);
            } else {
              // file uploaded
              resolve({ s3:sres, size: s})
            }
          });
        }
      })
    })
  });
}

function getSize() {
  return new Promise(function(resolve, reject) {
    var child = exec('./admesh /tmp/obj.stl');
    var out = "";

    child.stdout.on('data', function(d) {
      out += d;
    });

    child.on('close', function() {
      console.info(out);
      out.split('Size')[1];
      out = out.split("============== Size ==============");
      out = out[1];

      var m = out.match(/\S+/g);

      var minx = parseFloat(m[3])
      , maxx = parseFloat(m[7])
      , miny = parseFloat(m[11])
      , maxy = parseFloat(m[15])
      , minz = parseFloat(m[19])
      , maxz = parseFloat(m[23])
      , lx = maxx - minx
      , ly = maxy - miny
      , lz = maxz - minz

      console.info("X: ", lx, " Y:", ly, " Z:", lz);
      resolve([lx, ly, lz]);
     });

     child.on('error', function(e) {
       console.info("ERROR trying to get object size! ", e);
       reject('error');
     })

   });
}


function downloadFile(url, file_path) {
  return new Promise(function(resolve, reject) {
    var f = fs.createWriteStream(file_path);
    console.info("URL", url);
    console.info("PATH", file_path)
    http.get(url, function(res) {
      res.pipe(f);
      f.on('finish', function() {
        console.info('FINISHED DOWNLOADING FILE');
        f.close(resolve(file_path));
      });
    }).on('error', function(err) {
      reject(err);
    });
  })
}

module.exports.importThingiverse = function(event, context, cb) {
  importThing(event).then(
    function(res) {
      console.info("DONE!", res);
      cb(null, res);
    }
  ).catch(function(err) {
    cb(err, null);
  })
}
