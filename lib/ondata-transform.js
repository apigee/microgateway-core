'use strict';

const async = require('async');
const debug = require('debug')('gateway:main');
const Transform = require('stream').Transform;
const util = require('util');

function OnDataTransform(context) {
  this.pluginHooks = context.pluginHooks;
  Transform.call(this, { objectMode: false });
}
util.inherits(OnDataTransform, Transform);

OnDataTransform.prototype._transform = function (data, encoding, done) {
  debug('req data', data ? data.length : 'null');
  var self = this;
  async.seq.apply(this, self.pluginHooks)(data,
    function(err, result) {
      if (err) {
        console.error(err);
        done(err);
      }
      else {
        if(result) {
          self.push(result);
        }
        done();
      }
    });
}

module.exports = OnDataTransform;