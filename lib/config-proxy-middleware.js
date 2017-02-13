'use strict';

const path = require('path');
const url = require('url');
const debug = require('debug')('gateway:main');
const configService = require('./config');
const double_slash_regex = /\/\/+/g;
const http = require('http');
const https = require('https');
const _ = require('lodash');


/**
 * adds proxy to request
 * @param config
 * @returns {Function}
 */
module.exports = function () {

  const config = configService.get();

  if(config && config.proxies) {
    config.proxies.forEach(function (proxy) {
      proxy.parsedUrl = url.parse(proxy.url);
      const secure = proxy.parsedUrl.protocol === 'https:';
      proxy.basePathLength = proxy.base_path.length;
      proxy.secure = secure;
      const agentLib = secure ? https : http;
      var opts = {
        maxSockets: limit(proxy.max_connections),
        keepAlive: true
      }

      if (proxy.secure && Array.isArray(config.targets)) {
        var filtered = config.targets.filter(function(target) {
          var hostname = proxy.parsedUrl.hostname;
          return target.host === hostname
            && typeof target.ssl === 'object'
            && typeof target.ssl.client === 'object';
        });

        if (filtered.length) {
          // get SSL options from the last client object
          var lastIndex = filtered.length - 1;
          var last = filtered[lastIndex]
          var httpsOptions = last.ssl.client.httpsOptions;
          var save = opts;
          opts = httpsOptions;
          opts.keepAlive = save.keepAlive;
          opts.maxSockets = save.maxSockets;
        }
        // check for client ssl options
      }

      proxy.agent = new agentLib.Agent(opts);
    });
  }

  return (req, res, next) => {
    const reqUrl = url.parse(req.url, true);

    req.reqUrl = reqUrl;

    req._overrideHeaders = {};
    req._headersToUnset = [];

    req.setOverrideHeader = function(k, v) {
      req._overrideHeaders[k] = v; 
    };

    req.unsetHeader = function(k) {
      req._headersToUnset.push(k); 
    };

    const proxy = getProxyfromBasePath(config.proxies, reqUrl.pathname);

    if (!proxy) {
      res.statusCode = 404; // No matching path found
      debug('dropped', res.statusCode, req.method, req.url, req.headers, 'no match found for ' + reqUrl.pathname);
      const nomatch = Error('no match found for ' + reqUrl.pathname);
      nomatch.status = res.statusCode;
      return next(nomatch);
    }

    res.proxy = proxy; // set for other middleware to pick up

    debug('selected proxy %s with base path %s for request path %s', proxy.url, proxy.base_path, reqUrl.pathname);

    var target_path =
        proxy.parsedUrl.pathname + reqUrl.pathname.substr(proxy.basePathLength, reqUrl.pathname.length); // strip leading base_path
    target_path = target_path.replace(double_slash_regex, '/'); // remove any unintended double slashes
    target_path += reqUrl.search || ''; // append the search string if necessary

    req.targetPath = target_path;
    req.targetHostname = proxy.parsedUrl.hostname;

    next();
  };

};

// find the most specific proxy whose base_path is the base_path of request
// this is done brute-force at this time
const getProxyfromBasePath = function (proxies, pathname) {
  var longest = 0;
  var match = undefined;
  proxies.forEach(function(proxy) {
    if (pathname.indexOf(proxy.base_path) === 0) {
      if (proxy.base_path.length > longest) {
        match = proxy;
        longest = proxy.base_path.length;
      }
    }
  });
  return match;
}

const limit = (value) => {
  return value && typeof value === 'number' && value > 0 ? value : Infinity;
}
