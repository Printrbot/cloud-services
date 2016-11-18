// Author: Mick Balaban
// Copyright (c) 2016 Printrbot

var Jimp = require('jimp')
  , Promise = require('bluebird')
  , fs = Promise.promisifyAll(require("fs"));

Promise.promisifyAll(Jimp);

module.exports.scaleToWidth = function(w, p, file)
{
  return new Promise(function(resolve, reject) {
    var fp = file.path.replace('.'+file.extension, '_'+p+'.'+file.extension)
    Jimp.read(file.path)
    .then(function(img) {
      img.resize(w, Jimp.AUTO)            // resize
      .write(fp); // save
      resolve(fp);
    }).catch(function (err) {
      reject(err);
    });
  });
}

module.exports.cover = function(w, h, p, file_path)
{
  return new Promise(function(resolve, reject) {
    var fp = file_path.replace('.', '_'+p+'.')
    Jimp.read(file_path)
    .then(function(img) {
      img.cover(w, h)            // resize
      .write(fp); // save
      resolve(fp);
    }).catch(function (err) {
      reject(err);
    });
  });
}


// 270 x 240 - jpg // grid
// 270 x 240 - raw // printer hub
module.exports.createAllSizes = function(file_path)
{
  return new Promise(function(resolve, reject) {
    var paths = [
      file_path,
      file_path.replace('.png', '_2.png'),
      file_path.replace('.png', '.raw')
    ];
    Jimp.readAsync(file_path)
    .then(function(j) {
      console.info("DONE READING")
      // create grid image
      j.cover(270, 240)
      .write(paths[1])
      .dither565();

      var c = 0;
      var buf = new Buffer((j.bitmap.width * j.bitmap.height)*2);
      for (var x=0;x<j.bitmap.width;x++) {
        for (var y=0;y<j.bitmap.height;y++) {
          var b = j.getPixelColor(x,y);
          var rgba = Jimp.intToRGBA(b);
          var _p = rgba.r << 8 | rgba.g << 3 | rgba.b >> 3;
          buf.writeUInt16LE(_p, c, 2);
          c+=2;
        }
      }
      fs.writeFileAsync(paths[2], buf)
      .then(function(r) {
        console.info("DONE WRITING FILE...")
        setTimeout(function() {
            resolve(paths);
        }, 1000)
      })
    })
    .catch(function (err) {
      console.info(err);
      reject(err);
    });
  });
}
