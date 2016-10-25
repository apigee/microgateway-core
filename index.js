'use strict';
var debug = require('debug')('gateway:index');
var util = require('util');
var gateway = require('./lib/gateway');
var assert = require('assert');
var logging = require('./lib/logging');
var stats = require('./lib/stats');

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
  assert(config, 'Gateway must be instantiated with a config');
  config.uid = uuid.v1();
  configService.init(config);
  logging.init();
  this.plugins = {};
  this.pluginLoader = pluginsLib();
};

module.exports = function (config) {
  return new Gateway(config);
}

Gateway.prototype.start = function (cb) {
  debug('starting edgemicro');
  debug('loaded config ' + util.inspect(configService.get(), {colors: true}));
  gateway.start(this.plugins, function (err, server) {
    if (err) {
      console.error('error starting edge micro', err);
    }
    return cb(err, server)
  });
};

Gateway.prototype.stop = function(cb){
  gateway.stop(cb);
}

const gatherPluginConfigForProxy = function(name, proxy) {
  let config = configService.get();
  var pluginConfig = {};
  Object.keys(config.scopes).forEach( (scope) => {
    if (scope == proxy.scope) {
      pluginConfig = config.scopes[scope][name];
    }
  })
  return _.merge({}, config[name] || {}, pluginConfig);
}

Gateway.prototype.addPlugin = function (proxy, name, plugin) {
  assert(name,"plugin must have a name")
  assert(_.isString(name),"name must be a string");
  assert(_.isFunction(plugin),"plugin must be a function(config,logger,stats){return {onresponse:function(req,res,data,next){}}}");
  const handler = this.pluginLoader.loadPluginForProxy({plugin:plugin, pluginName:name, proxy: proxy}, gatherPluginConfigForProxy(name, proxy));
  var pluginMapKey = proxy.scope + '_' + proxy.proxy_name;
  if (!this.plugins[pluginMapKey]) {
    this.plugins[pluginMapKey] = [];
  }
  this.plugins[pluginMapKey].push(handler);
};

