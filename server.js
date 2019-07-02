'use strict'
const assert = require('assert')
//var path = require('path')
//var gateway = require('./index');
//var uuid = require('uuid/v1');


/// not certain that this module is in use.

//todo replace this with better logic.
var key, secret, source;
process.argv.forEach(function (val) {
  let params = val.split('=');
  if (params.length !== 2) {
    return;
  }
  let k = params[0];
  let v = params[1];
  console.log('setting key %s to %s', k, v)
  switch (k) {
    case 'key' :
      key = v;
      break;
    case 'secret' :
      secret = v;
      break;
    case 'source' :
      source = v;
      break;
  }
});

assert(key, 'must have a key');
assert(secret, 'must have a secret');
assert(source, 'must have a source config directory');

var options = {keys: {}, source: source};
options.keys.key = key;
options.keys.secret = secret;
//get the config

/*   PROBLEM:::  edgeConfig is not defined ... 
edgeConfig.get(options, function (err, config) {
  assert(!err, err)

  defaultConfig(config, key, secret);

  var server = gateway(config);

  //load plugins
  var pluginsDir = path.normalize(config.edgemicro.plugins.dir);
  var plugins = server.getPluginsLoader().loadPlugins(pluginsDir);
  plugins && console.log('plugins loaded ' + plugins.length)
  //start the server
  server.start(plugins, (err , server ) => {
    assert(!err, err)
    console.log('server is started');
  });
})

*/


/*
var defaultConfig = function (config) {
  //required by plugins
  config.key = key;
  config.secret = secret;

  // set proxying options for the request module, if so configured
  const requestOptions = config.edgemicro.proxy ? {
    proxy: config.edgemicro.proxy,
    tunnel: config.edgemicro.proxy_tunnel
  } : {};

  //turn on by default
  config.analytics = config.analytics || {}
  config.analytics.key = config.key;
  config.analytics.secret = config.secret;
  config.analytics['request'] = requestOptions;

  // copy keys to quota section
  if (config.quota) {
    Object.keys(config.quota).forEach(function (name) {
      var quota = config.quota[name];
      quota.key = config.key;
      quota.secret = config.secret;
    });
    config.quota['request'] = requestOptions;

  }

  if (config.oauth) {
    config.oauth['request'] = requestOptions;
  }

  if (config.spikearrest) {
    config.spikearrest['request'] = requestOptions;
  }
}
*/