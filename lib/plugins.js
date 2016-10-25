'use strict';
const fs = require('fs');
const path = require('path');
const debug = require('debug')('gateway:init');
const util = require('util')
const _ = require('lodash');
const assert = require('assert')
const logging = require('./logging');
const configService = require('./config');
const stats = require('./stats');


var Plugins = function () {
  this.config = configService.get();
};

/**
 * calls init and returns plugin loaded
 * @param options {pluginName,plugin}
 * @returns {*}
 */
Plugins.prototype.loadPluginForProxy = function (options, subconfig) {
  var name;
  var plugin;

  subconfig = subconfig || {};

  if (_.isObject(options)) {
    assert(options.plugin, "must have plugin loaded in memory");
    if (_.isFunction(options.plugin)) {
      plugin = options.plugin;
    } else {
      assert(_.isFunction(options.plugin.init), 'init must be a function');
      plugin = _.bind(options.plugin.init, options.plugin);
    }
    assert(options.pluginName, "must have plugin name");
    name = options.pluginName;
  } else {
    throw new Error('bad plugin')
  }
  const config = this.config;
  const logger = logging.getLogger();

  var middleware;
  //TODO take this out
// TODO stuff keys in before
  if (plugin) {
    if(config.keys && config.keys.key && config.keys.secret){
      subconfig.key = config.keys.key;
      subconfig.secret = config.keys.secret;
    }
    //eh idk if this is necessary
    if(config.system.proxy) {
      subconfig.request = {
        proxy: config.system.proxy,
        tunnel: config.system.proxy_tunnel
      };
    }
    middleware = plugin(subconfig, logger, stats);
    assert(_.isObject(middleware), 'ignoring invalid plugin handlers ' + name);
    middleware.id = name;
    console.info('installed plugin from', name);
  } else {
    console.error('error loading plugin', name);
  }
  return middleware
};

exports = module.exports = function () {
  return new Plugins();
};

