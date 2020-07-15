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
  this.emgConfigs = null;
};


/**
 * calls init and returns plugin loaded
 * @param options {pluginName,plugin}
 * @returns {*}
 */
Plugins.prototype.loadPlugin = function (options) {
  var name;
  var plugin;
  // extract only emg level configs by removing plugin configs.
  if (options.allPluginNames && !this.emgConfigs) {
    this.emgConfigs = {}
    let sequence = [];
    if ( this.config.edgemicro.plugins && this.config.edgemicro.plugins.sequence ) {
      sequence = this.config.edgemicro.plugins.sequence;
    }
    Object.keys(this.config).filter( key => sequence.indexOf(key) === -1 && key !== 'quotas'
    && options.allPluginNames.indexOf(key) === -1).forEach( emgKey => {
      this.emgConfigs[emgKey] = this.config[emgKey];
    });
  }

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
  subconfig.emgConfigs = this.emgConfigs;
  if (plugin) {
    if(config.keys && config.keys.key && config.keys.secret){
      subconfig.key = config.keys.key;
      subconfig.secret = config.keys.secret;
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

