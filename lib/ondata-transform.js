'use strict';

const async = require('async');
const debug = require('debug')('gateway:main');
const Transform = require('stream').Transform;
const util = require('util');
const logging = require('./logging');

// req and res are the source request and response, These are used for logging.
function OnDataTransform(context,req,res) {
  this.pluginHooks = context.pluginHooks;
  this.sourceReq = req;
  this.sourceRes = res;
  Transform.call(this, { objectMode: false });
}
util.inherits(OnDataTransform, Transform);

OnDataTransform.prototype._transform = function (data, encoding, done) {
  const logger = logging.getLogger();
  debug('req data', data ? data.length : 'null');
  var self = this;
  async.seq.apply(this, self.pluginHooks)(data,
    function(err, result) {
      if (err) {
        logger.eventLog({level:'error', req: this.sourceReq, res: this.sourceRes, err:err, component:'microgateway-core' },"Error in transform");
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