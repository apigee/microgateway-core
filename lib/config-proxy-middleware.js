'use strict';

//const _ = require('lodash');
//const path = require('path');


const url = require('url');
const debug = require('debug')('gateway:main');
const configService = require('./config');
const double_slash_regex = /\/\/+/g;
const http = require('http');
const https = require('https');
const buildTunnelAgent = require('./build-tunnel-agent')
const checkNoProxy = require('./no-proxy-parser')
const proxyPathMatcher = require('./proxy-path-matcher');
const getProxyFromBasePath = proxyPathMatcher.getProxyFromBasePath;
const generateMatchingRegex = proxyPathMatcher.generateMatchingRegex;
const sanitizer = require('sanitizer');

/**
 * adds proxy to request
 * @param config
 * @returns {Function}
 */
module.exports = function() {

    const config = configService.get();
    //TODO: Respect HTTP_PROXY and HTTPS_PROXY
    const httpProxyConfig = config.edgemicro.proxy;
    const httpProxyTunnelConfig = config.edgemicro.proxy_tunnel;

    if (config && config.proxies) {
        config.proxies.forEach(function(proxy) {
            var secureProxy;
            if (httpProxyConfig) {
                var parsedHttpProxyConfig = url.parse(httpProxyConfig);
                secureProxy = parsedHttpProxyConfig.protocol === 'https:';
            }

            proxy.parsedUrl = url.parse(proxy.url);
            const secure = proxy.parsedUrl.protocol === 'https:';
            proxy.basePathLength = proxy.base_path.length;
            proxy.secure = secure;
            proxy.secureHttpProxy = secureProxy;
            var agentLib = http;

            if ( secure || secureProxy ) {
                agentLib = https;
            }
            var opts = {
                maxSockets: limit(proxy.max_connections),
                keepAlive: true
            }

            if ((proxy.secure || proxy.secureHttpProxy) && Array.isArray(config.targets)) {

                var filtered = config.targets.filter(function(target) {
                    var hostname = proxy.parsedUrl.hostname;

                    //If our proxy configuration is https let's check for any configuration
                    //for enabling TLS
                    if (proxy.secureHttpProxy) {
                        hostname = parsedHttpProxyConfig.hostname;
                    }

                    return (!target.host || target.host === hostname) &&
                        typeof target.ssl === 'object' &&
                        typeof target.ssl.client === 'object';
                });

                if (filtered.length) {
                    // get SSL options from the last client object
                    var lastIndex = filtered.length - 1;
                    var last = filtered[lastIndex];
                    var httpsOptions = last.ssl.client.httpsOptions;
                    var save = opts;
                    opts = httpsOptions;
                    opts.keepAlive = save.keepAlive;
                    opts.maxSockets = save.maxSockets;
                }
                // check for client ssl options
            }

            var noProxy = process.env.NO_PROXY || process.env.no_proxy;
            const shouldntUseProxy = checkNoProxy(proxy.url, noProxy);
            if (httpProxyConfig && (httpProxyTunnelConfig || secure) && !shouldntUseProxy) {
                const tunnelAgent = buildTunnelAgent(httpProxyConfig, opts, proxy);
                proxy.agent = tunnelAgent;
                proxy.tunnelEnabled = true;
            } else {
                proxy.agent = new agentLib.Agent(opts);
                proxy.tunnelEnabled = false;
            }
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

        const proxy = getProxyFromBasePath(config.proxies, reqUrl.pathname);

        if (!proxy) {
            res.statusCode = 404; // No matching path found
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            debug('dropped', res.statusCode, req.method, req.url, req.headers, 'no match found for ' + reqUrl.pathname);
            const nomatch = Error('no match found for ' + sanitizer.escape(reqUrl.pathname));
            nomatch.status = res.statusCode;
            return next(nomatch);
        }

        res.proxy = proxy; // set for other middleware to pick up

        debug('selected proxy %s with base path %s for request path %s', proxy.url, proxy.base_path, reqUrl.pathname);

        var basePathStripRegex = generateMatchingRegex(proxy.base_path);
        // strip leading base_path
        var strippedBasePath = reqUrl.pathname.replace(basePathStripRegex, '');
        var target_path =
            proxy.parsedUrl.pathname + strippedBasePath;
        target_path = target_path.replace(double_slash_regex, '/'); // remove any unintended double slashes
        target_path += reqUrl.search || ''; // append the search string if necessary

        req.targetPath = target_path;
        req.targetHostname = proxy.parsedUrl.hostname;
        //add support to override port and secure
        req.targetPort = proxy.parsedUrl.port;
        req.targetSecure = proxy.secure;
        next();
    };

};

const limit = (value) => {
    return value && typeof value === 'number' && value > 0 ? value : Infinity;
}
