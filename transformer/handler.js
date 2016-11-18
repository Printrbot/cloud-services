// Transformer
// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

(function () {
   'use strict';
}());


var exec = require('child_process').exec
  , AWS = require('aws-sdk')
  , fs = require('fs')

AWS.config.region = 'us-west-2';

module.exports.transform = function(event, context, cb) {

  if (!event.file_path || !event.user)
    return cb("Required parameters missing");

  var key_path = 'u/'+(event.user)+'/i/'+(event.id)+'/';
  var s3 = new AWS.S3()
    , temp_stl_file = require('fs').createWriteStream('/tmp/obj.stl')
    , bucket = 'files.printrapp.com'
    , params = {Bucket: bucket, Key: event.file_path}
    , rotations = [];

  function rotateMesh(cb) {
    if (rotations.length == 0)
      cb();
    else {
       var r = rotations.pop();
       console.info("rotating ",r[0],r[1]);
       cmd = './admesh --'+r[0]+'-rotate='+r[1]+' --write-binary-stl=/tmp/obj.stl /tmp/obj.stl';
       exec(cmd, function callback(error, stdout, stderr) {
         console.info(error);
         console.info(stderr);
         rotateMesh(cb);
       });
    }
  }

  function moveToZero(cb) {
    if (rotations.length == 0)
      cb();
    else {
       cmd = './admesh --translate=0,0,0 --write-binary-stl=/tmp/obj.stl /tmp/obj.stl';
       exec(cmd, function callback(error, stdout, stderr) {
         console.info("ERROR:", error);
         console.info("STDERR", stderr);
         cb();
       });
    }
  }

  function getSize(cb) {
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
      cb([lx, ly, lz]);
     });

     child.on('error', function(e) {
       console.info("ERROR trying to get object size! ", e);
       cb();
     })

  }

  function transformIt(cb) {
    console.info('DOWNLOADED, transforming now');
    console.info("EVENTS: ", event);
    console.info("ALL", event.rotate);

    if (parseFloat(event.rotate.x) != 0)
      rotations.push(['x', parseFloat(event.rotate.x) * (180/Math.PI)]);
    if (parseFloat(event.rotate.y) != 0)
      rotations.push(['y', parseFloat(event.rotate.y) * (180/Math.PI)]);
    if (parseFloat(event.rotate.z) != 0)
      rotations.push(['z', parseFloat(event.rotate.z) * (180/Math.PI)]);

    if (rotations.length == 0)
      return cb("Nothing to do", null);

    moveToZero(function() {
      rotateMesh(function() {
        moveToZero(function() {
          getSize(function(s) {
            console.info("DONE WITH Transformations");
            console.info(s);

            fs.readFile("/tmp/obj.stl", function(err, data) {
              if (err) {
                console.info("unable to open stl file!!!");
                cb(err, null);
              } else {
                console.info("FINISHED READING modified FILE");
                var params = {
                  Bucket: bucket,
                  Key: event.file_path,
                  Body: data,
                  ACL: 'public-read'
                };
                console.info(params);
                var s3bucket = new AWS.S3({params: { Bucket: bucket }});
                s3bucket.upload(params, function(err, sres) {
                  if (err) {
                    cb(err, null);
                  } else {
                    console.info("UPLOADED FILE, ALL GOOD")
                    cb(null, {message: sres, size: s});
                  }
                });
              }
            });
          });
        })
      })
    });
  }

  console.log(params);
  // fetch the stl file from s3 bucket
  s3.getObject(params)
  .on('httpData', function(chunk) {
    temp_stl_file.write(chunk);
  })
  .on('httpDone', function() {
    temp_stl_file.end();
    // wait a second before trying to run the rest
    // to allow file to finish
    setTimeout(function() {
      transformIt(cb);
    }, 1000);

  })
  .send();
};
