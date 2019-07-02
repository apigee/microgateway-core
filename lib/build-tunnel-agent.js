'use strict';

const url = require('url');
const TunnelAgent = require('tunnel-agent');

/*
 * Build an agent for CONNECT based http tunneling
 * tunnel-agent takes care of all the socket semantics of passing http requests
 * over a tunneled TCP connection
 * 
 * This is used when a user specifically wants to use a tunnel by specifying the 
 * tunnel option as true in config, or when the target is TLS enabled.
 */ 

module.exports = (proxyConfig, agentOptions, proxy, proxyHeaders) => {
  proxyHeaders = proxyHeaders || {};
  const parsedProxyUrl = url.parse(proxyConfig); 

  const tunnelOpts = createTunnelAgentOptions(parsedProxyUrl, agentOptions, proxy);
  const tunnelAgentFunction =  getTunnelFunction(proxy.parsedUrl.protocol, parsedProxyUrl.protocol);
  return tunnelAgentFunction(tunnelOpts);
}

const createTunnelAgentOptions = (parsedProxyUrl, agentOptions) => {      //, proxy) => {  // not used jshint 

  var tunnelOpts = {
    proxy: {
      host: parsedProxyUrl.hostname,
      port: parsedProxyUrl.port
    },
    ca: agentOptions.ca,
    cert: agentOptions.cert,
    key: agentOptions.key,
    passphrase: agentOptions.passphrase,
    pfx: agentOptions.pfx,
    ciphers: agentOptions.ciphers,
    rejectUnauthorized: agentOptions.rejectUnauthorized,
    secureOptions: agentOptions.secureOptions,
    secureProtocol: agentOptions.secureProtocol
  };   

  return tunnelOpts;
}


const getTunnelFunction = (targetProtocol, proxyProtocol) => {
  var functionName = '';

  if(targetProtocol.indexOf('https') > -1) {
    functionName += 'https';
  } else {
    functionName += 'http';
  }

  functionName += 'Over';

  if(proxyProtocol.indexOf('https') > -1) {
    functionName += 'Https';
  } else {
    functionName += 'Http';
  }

  return TunnelAgent[functionName];
}

module.exports.createTunnelAgentOptions = createTunnelAgentOptions;
module.exports.getTunnelFunction = getTunnelFunction;
