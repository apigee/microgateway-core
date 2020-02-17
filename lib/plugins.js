'use strict';

/*
const fs = require('fs');
const path = require('path');
const debug = require('debug')('gateway:init');
const util = require('util')
*/

const _ = require('lodash');
const assert = require('assert')
const logging = require('./logging');
const configService = require('./config');
const stats = require('./stats');

const CONSOLE_LOG_TAG = 'microgateway-core plugins';

var Plugins = function () {
  this.config = configService.get();
};


/**
 * calls init and returns plugin loaded
 * @param options {pluginName,plugin}
 * @returns {*}
 */
Plugins.prototype.loadPlugin = function (options) {
  var name;
  var plugin;

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
  const subconfig = config[name] || {};

  if (plugin) {
    if(config.keys && config.keys.key && config.keys.secret){
      subconfig.key = config.keys.key;
      subconfig.secret = config.keys.secret;
    }
    if(config.edgemicro.proxy_tunnel) {
      subconfig.request = {
        tunnel: config.edgemicro.proxy_tunnel
      };
    }

    if(name==='quota') {
      subconfig.proxies = config.proxies;
      subconfig.product_to_proxy = config.product_to_proxy;
    }
    middleware = plugin(subconfig, logger, stats);
    assert(_.isObject(middleware), 'ignoring invalid plugin handlers ' + name);
    middleware.id = name;
    logger.info({}, 'installed plugin from ' + name);
    logger.debug({}, 'installed plugin from ' + name + ' and subconfig=' + JSON.stringify(subconfig));
  } else {
    logger.consoleLog('error',{component: CONSOLE_LOG_TAG},'error loading plugin', name);
  }
  return middleware
};

exports = module.exports = function () {
  return new Plugins();
};

