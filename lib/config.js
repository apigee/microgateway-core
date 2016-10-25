'use strict'
var assert = require('assert');
var fs = require('fs');
var config = {};
var configService = module.exports = {}

configService.get = () => {
  assert(config, 'config not initialized')
  return config
};

configService.init = (newConfig) => {
  config = newConfig;
  //this is for ssl options
  config.targets = config.targets || [];

  config.targets.forEach(function(target) {
    if (typeof target.ssl !== 'object'
        || typeof target.ssl.client !== 'object') {
      return;
    }

    // restrict the copied options to prevent target hijacking
    // via configuration
    target.ssl.client.httpsOptions = {
      pfx: target.ssl.client.pfx,
      key: target.ssl.client.key,
      passpharse: target.ssl.client.passphrase,
      cert: target.ssl.client.cert,
      ca: target.ssl.client.ca,
      ciphers: target.ssl.client.ciphers,
      rejectUnauthorized: target.ssl.client.rejectUnauthorized,
      secureProtocol: target.ssl.client.secureProtocol,
      servername: target.ssl.client.servername
    };

    var fileOptions = ['cert', 'key', 'ca', 'pfx'];
    fileOptions.forEach(function(opt) {
      var filename = target.ssl.client.httpsOptions[opt];
      if (filename) {
        target.ssl.client.httpsOptions[opt] = fs.readFileSync(filename);
      }
    });
  });
}
