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

  var baseObject = {};
  if (this.config.edgemicro.metrics) {
    baseObject = require('./metrics').client(this.config.edgemicro.metrics.port || 8125);
  }
  // Merge stats objects to fulfill obligations per documentation, overriding getters/setters
  Object.keys(stats.getStats()).forEach((field) =>
      Object.defineProperty(baseObject, field, {
        get: function () {
          return stats.getStats()[field];
        },
        set: function (newValue) {
          console.error("Attempt to set properties on `stats` object not permitted");
          //do nothing, you can't override these for now.
        }
      }));
  this.metrics = baseObject
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
    if(config.edgemicro.proxy) {
      subconfig.request = {
        proxy: config.edgemicro.proxy,
        tunnel: config.edgemicro.proxy_tunnel
      };
    }
    middleware = plugin(subconfig, logger, this.metrics);
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