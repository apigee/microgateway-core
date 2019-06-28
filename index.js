'use strict';
var debug = require('debug')('gateway:index');
var gateway = require('./lib/gateway');
var assert = require('assert');
var logging = require('./lib/logging');


var pluginsLib = require('./lib/plugins');
var uuid = require('uuid')
var configService = require('./lib/config');
var _ = require('lodash');

/**
 *
 * @param config must include {key:string,secret:string}
 * @param cb callback when started
 */
var Gateway = function (config) {
  assert(config, 'options must contain config')
  config.uid = uuid.v1()
  configService.init(config);
  logging.init()
  this.plugins = [];
  this.pluginLoader = pluginsLib();

};


module.exports = function (config) {
  return new Gateway(config);
}

module.exports.Logging = logging;
Gateway.prototype.start = function (cb) {
  //const logger =logging.getLogger();
  //const config = configService.get();
  let plugins  = this.plugins;
  debug('starting edgemicro');
  //debug('loaded config ' + util.inspect(config, {colors: true}));
  gateway.start( plugins, function (err, server) {
    if (err) {
      console.error('error starting edge micro', err);
    }
    return cb(err, server)
  });
};

Gateway.prototype.stop = function(cb){
  gateway.stop(cb);
}

Gateway.prototype.addPlugin = function (name,plugin) {
  assert(name,"plugin must have a name")
  assert(_.isString(name),"name must be a string");
  assert(_.isFunction(plugin),"plugin must be a function(config,logger,stats){return {onresponse:function(req,res,data,next){}}}");
  const handler = this.pluginLoader.loadPlugin({plugin:plugin,pluginName:name});
  this.plugins.push(handler);
};

