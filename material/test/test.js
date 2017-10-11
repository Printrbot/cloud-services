var assert = require('assert');
var fs = require('fs');
var handler = require('../handler');

// Read sample materials record from file
var materials = require('./data/sample-materials-record.json');
// Read sample v1 matlib from file
var matlibV1 = fs.readFileSync('./data/matlib-v1.dat');

// Validate input sample file
describe('sample-materials-record.json', function() {
    it('should contain a valid record', function() {
        assert.ok(materials);
        assert.equal("1d53fa5ce74020b3497692bc200b2f32", materials._id, "unexpected value for _id field");
        assert.equal("1d53fa5ce74020b3497692bc200b2a0e", materials.user, "unexpected value for user field");
        assert.ok(materials.material_types, "missing material_types entries in sample record");
        assert.ok(materials.materials, "missing materials entries in sample record");
    });
    
    it('should contain the expected number of materials entries', function() {
        assert.equal(10, materials.materials.length);
    });
})

// Validate output against input sample file
describe('handler', function() {
    describe('#createV1Matlib(materials)', function() {
        it('should be accessible', function() {
            assert.ok(handler.createV1Matlib);
        });

        it('should produce an s3 params object with the expected keys', function() {
            var v1UploadParams = handler.createV1Matlib(materials);
            assert.equal('u/' + (materials.user) + '/data/matlib', v1UploadParams.Key);
            assert.equal(matlibV1.length, v1UploadParams.Body.length);
        });

        it('should produce the expected v1 matlib file format', function() {
            var v1UploadParams = handler.createV1Matlib(materials);
            assert.ok(matlibV1.equals(v1UploadParams.Body));
        });
    });
});
