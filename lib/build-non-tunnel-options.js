'use strict';

const url = require('url');

/*
 * Build options for a proxied request. This means:
 * Change request options to point at the proxy server
 * Change path of the request the full URL of where the request should be routed.
 */ 

module.exports = (proxy, requestOpts, proxyOpts) => {
  
  const parsedQuery = url.parse(requestOpts.path);

  var protocol;
  if(proxy.secure) {
    protocol = 'https';
  } else {
    protocol = 'http';
  }

  const opts = {
    pathname: parsedQuery.pathname,
    hostname: requestOpts.hostname,
    port: requestOpts.port,
    protocol: protocol
  };

  if(parsedQuery.search) {
    opts.search = parsedQuery.search;
  }

  var targetPath = url.format(opts);
  const parsedHttpProxyUrl = url.parse(proxyOpts);
  
  var newOpts = {
    method: requestOpts.method,
    hostname: parsedHttpProxyUrl.hostname,
    port: parsedHttpProxyUrl.port,
    path: targetPath,
    headers: requestOpts.headers,
    agent: requestOpts.agent
  }

  return newOpts;
}
