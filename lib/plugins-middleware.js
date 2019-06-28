'use strict';
//
const http = require('http');
const https = require('https');
const uuid = require('uuid');
const _ = require('lodash');
const async = require('async');
const debug = require('debug')('gateway:main');
const logging = require('./logging')
const assert = require('assert');
const stats = require('./stats')
const OnDataTransform = require('./ondata-transform');
const configService = require('./config');
const buildNonTunnelOptions = require('./build-non-tunnel-options')
const checkNoProxy = require('./no-proxy-parser')
const empty_buffer = new Buffer(0);

//opentracing
var traceHelper = require('./trace-helper');
//


/**
 * injects plugins into gateway
 * @param plugins
 * @returns {Function(req,res,cb)}
 */
module.exports = function(plugins) {
    const logger = logging.getLogger();

    return function(sourceRequest, sourceResponse, next) {
        const startTime = Date.now();
        const correlation_id = uuid.v1();

        //opentracing
        sourceRequest = traceHelper.initTracer(sourceResponse.proxy.name, sourceRequest, correlation_id);
        //

        var len = JSON.stringify(sourceRequest.headers).length;
        debug("Request header: " + len);
        if (configService.get().edgemicro.maxHttpHeaderSize && len > configService.get().edgemicro.maxHttpHeaderSize) {
            sourceResponse.setHeader('Content-Type', 'application/json');
            sourceResponse.writeHead(400);
            sourceResponse.write('{"error":"header length more than allowed size"}');
            sourceResponse.end();
            logger.error('header length more than allowed size');
            //opentracing
            traceHelper.setRequestError('','header length more than allowed size','', 400);
            //
            return next(false);
        } else {
            logger.info({
                req: sourceRequest,
                i: correlation_id
            }, 'sourceRequest');
            debug('sourceRequest', correlation_id, sourceRequest.method, sourceRequest.url);
            //process the requests
            async.series(
                //onrequest
                getPluginHooksForEvent(null, {
                    plugins: plugins,
                    sourceRequest: sourceRequest,
                    sourceResponse: sourceResponse
                }),
                function(err) {
                    if (_.isBoolean(err) && err) {
                        return next(false);
                    }
                    if (err) {
                        return next(err)
                    }
                    //opentrace
                    traceHelper.startTargetSpan(correlation_id, sourceRequest.targetHostname);
                    //closetrace
                    
                    //create target request
                    const targetRequest = getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id,
                        //callback for when response is initiated
                        (err, targetResponse) => {

                            if (err) {
                                return next(err);
                            }
                            const options = {
                                start: startTime,
                                correlation_id: correlation_id,
                                plugins: plugins,
                                sourceRequest: sourceRequest,
                                sourceResponse: sourceResponse,
                            };

                            handleTargetResponse(targetRequest, targetResponse, options, function(err) {
                                try {
                                    if (err) {
                                        next(err);
                                    } else {
                                        //opentracing
                                        traceHelper.finishRequestSpan();
                                        //
                                        next();
                                    }
                                } catch (errors) {
                                    debug(errors);
                                }
                            })
                        });

                    //initiate request piping
                    subscribeToSourceRequestEvents(plugins, sourceRequest, sourceResponse, targetRequest);
                    targetRequest.on('close', function() {
                        debug('sourceRequest close');
                    });
                });
        }
    }

};

/**
 * Create the target request
 * @param plugins
 * @param correlation_id
 * @param sourceRequest
 * @param sourceResponse
 * @param cb
 * @private
 */
function getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb) {

    const logger = logging.getLogger();
    const config = configService.get();

    const proxy = sourceResponse.proxy;
    //capture the timestamp just before sending the data to the target server
    sourceRequest.headers['target_sent_start_timestamp'] = Date.now();

    // try to pass through most of the original request headers unmodified
    const target_headers = _.clone(sourceRequest.headers);
    //create request id only if the source doesn't have it.
    if (_configured(config, 'x-request-id') && !target_headers['x-request-id']) {
        // https://devcenter.heroku.com/articles/http-request-id
        target_headers['x-request-id'] =
            config.uid + '.' + correlation_id.toString();
    }

    if (_configured(config, 'x-forwarded-proto') && !target_headers['x-forwarded-proto']) {
        target_headers['x-forwarded-proto'] = sourceRequest.connection.encrypted ? 'https' : 'http';
    }

    if (_configured(config, 'x-forwarded-for')) {
        // append client address to the x-forwarded-for header
        var forwarded_for = target_headers['x-forwarded-for'] || '';
        if (forwarded_for.length > 0) {
            forwarded_for += ',';
        }
        forwarded_for += sourceRequest.socket.remoteAddress;
        target_headers['x-forwarded-for'] = forwarded_for;
    }

    var hostname = target_headers.host;
    if (hostname) { // might be missing (with an http-1.0 client for example)

        if (_configured(config, 'x-forwarded-host')) {
            // append host header to the x-forwarded-host header
            var forwarded_host = target_headers['x-forwarded-host'] || '';
            if (forwarded_host.length > 0) {
                forwarded_host += ',';
            }
            forwarded_host += hostname;
            target_headers['x-forwarded-host'] = forwarded_host;
        }

        const colon = hostname.indexOf(':');
        if (colon > 0) {
            hostname = hostname.substring(0, colon); // strip port if present
        }

        if (_configured(config, 'via')) {
            // append our hostname (but not the port), if present, to the via header
            var via = target_headers['via'] || '';
            if (via.length > 0) {
                via += ',';
            }
            via += sourceRequest.httpVersion + ' ' + hostname;
            target_headers['via'] = via;
        }

        // To avoid breaking backard compatibility, we need to remove the "Host" header unless explicitly told not to
        const resetHostHeader = config.headers && typeof config.headers.host !== 'undefined' ? config.headers.host : true;

        if (resetHostHeader === true) {
            delete target_headers.host;
        }

        if (target_headers['content-length']) {
            delete target_headers['content-length'];
            if(!target_headers['transfer-encoding'] && sourceRequest.method==='DELETE') {
                target_headers['transfer-encoding'] = 'chunked';
            }
        }
    }

    var httpLibrary = http;
    //changes to support target overrides
    if (sourceRequest.targetSecure || proxy.secureHttpProxy) {
        httpLibrary = https;
    }

    assert(httpLibrary.request, 'must have request method');

    var targetRequestOptions = {
        hostname: sourceRequest.targetHostname,
        port: parseInt(sourceRequest.targetPort), //proxy.parsedUrl.port,
        path: sourceRequest.targetPath,
        method: sourceRequest.method,
        headers: target_headers, // pass through the modified headers
        agent: proxy.agent
    };

    const httpProxyConfig = config.edgemicro.proxy;
    const httpProxyTunnelConfig = config.edgemicro.proxy_tunnel;

    //If we have a proxy configuration, but we aren't tunneling. 
    //Rewrite target request options to account for proxy configuration

    var noProxy = process.env.NO_PROXY || process.env.no_proxy;
    const shouldntUseProxy = checkNoProxy(proxy.url, noProxy);
    if (httpProxyConfig && !httpProxyTunnelConfig && !shouldntUseProxy) {
        targetRequestOptions = buildNonTunnelOptions(proxy, targetRequestOptions, httpProxyConfig);
    }


    if (config.edgemicro.request_timeout) {
        targetRequestOptions.timeout = config.edgemicro.request_timeout * 1000;
    }

    const targetRequest = httpLibrary.request(targetRequestOptions,
        (targetResponse) => cb(null, targetResponse));

    if (config.edgemicro.request_timeout) {
        const timeoutInterval = config.edgemicro.request_timeout * 1000;
        targetRequest.setTimeout(timeoutInterval, () => {
            debug('request timed out, aborting');
            targetRequest._timedOut = true;
            targetRequest.abort();
        });
    }

    targetRequest.on('error', function(err) {

        const logInfo = {
            m: targetRequestOptions.method,
            u: targetRequestOptions.path,
            h: targetRequestOptions.hostname + ':' + targetRequestOptions.port,
            i: correlation_id
        };
        logger.warn({
            req: logInfo,
            d: Date.now() - startTime,
            i: correlation_id,
            err: err
        }, 'targetRequest error');
        debug('targetRequest error', correlation_id, err.stack);
        async.series(getPluginHooksForEvent('error', {
                plugins: plugins,
                sourceRequest: sourceRequest,
                sourceResponse: sourceResponse
            }),
            function(e) {
                if (e) {
                    logger.error(e);
                    //opentracing
                    traceHelper.setResponseError(e, e.message, e.stack, e.statusCode);
                    //
                    cb(e);
                } else {
                    if (targetRequest._timedOut) {
                        sourceResponse.statusCode = 504; // Gateway Time-out
                        //opentracing
                        traceHelper.setResponseError('','','', 504);
                        //
                        cb(new Error("Gateway timed out trying to reach target"));
                    } else {
                        sourceResponse.statusCode = 502; // Bad Gateway
                        //opentracing
                        traceHelper.setResponseError('','','', 502);
                        //                        
                        cb(err);
                    }
                }
            });
    });

    const logInfo = {
        m: targetRequestOptions.method,
        u: targetRequestOptions.path,
        h: targetRequestOptions.hostname + ':' + targetRequestOptions.port,
        i: correlation_id
    };
    // log target request options, minus agent
    logger.info(logInfo, 'targetRequest');

    debug('targetRequest', correlation_id, targetRequestOptions.method, targetRequestOptions.hostname, targetRequestOptions.port, targetRequestOptions.path);
    stats.incrementRequestCount();
    return targetRequest;
}

/**
 * Handle the plugin wiring and response piping
 * @param targetRequest
 * @param targetResponse
 * @param options {start, correlation_id, plugins, sourceRequest, sourceResponse,promises}
 * @param cb
 * @private
 */
function handleTargetResponse(targetRequest, targetResponse, options, cb) {
    const start = options.start;
    const correlation_id = options.correlation_id;
    var copyOfPluginsReversed = options.plugins.slice().reverse();
    const plugins = copyOfPluginsReversed;
    const sourceRequest = options.sourceRequest;
    const sourceResponse = options.sourceResponse;
    const logger = logging.getLogger();
    const config = configService.get();

    logger.info({
        res: targetResponse,
        d: Date.now() - start,
        i: correlation_id
    }, 'targetResponse');
    debug('targetResponse', correlation_id, targetResponse.statusCode);
    async.series(
        //onresponse
        getPluginHooksForEvent(null, {
            plugins: plugins,
            sourceRequest: sourceRequest,
            sourceResponse: sourceResponse,
            targetRequest: targetRequest,
            targetResponse: targetResponse
        }),
        function(err, results) {
            if ( err ) logger.error(err);
            if (sourceResponse.finished || sourceResponse.headersSent) {
                logger.error("response finished before work can be done");
                return;
            }
            if (err) {
                //opentracing
                traceHelper.setResponseError(err, err.message, err.stack, err.statusCode);
                //
                return cb(err);
            }
            if (results !== undefined && results.length !== 0 && results[0] !== null) {
                debug(results);
            }
            stats.incrementStatusCount(targetResponse.statusCode);
            stats.incrementResponseCount();
            // the size of the body will change if any of the plugins transform the content
            // delete the response content-length to allow streaming.
            delete targetResponse.headers['content-length'];
            // propagate response headers from target to client
            Object.keys(targetResponse.headers).forEach(function(header) {
                // skip setting the 'connection: keep-alive' header
                // setting it causes gateway to not accept any more connections
                if (header !== 'connection') {
                    sourceResponse.setHeader(header, targetResponse.headers[header]);
                }
            });
            sourceResponse.statusCode = targetResponse.statusCode;
            if (targetResponse.statusMessage) {
                sourceResponse.statusMessage = targetResponse.statusMessage;
            }

            //opentrace
            if (targetResponse.statusCode > 399) {
                traceHelper.setResponseError('','','', targetResponse.statusCode);              
            } else {
                traceHelper.endTargetSpan(targetResponse.statusCode);
            }
            //closetrace

            if (_configured(config, 'x-response-time')) {
                sourceResponse.setHeader('x-response-time', Date.now() - start);
            }
            _subscribeToResponseEvents(plugins, sourceRequest, sourceResponse, targetRequest, targetResponse, correlation_id, start,
                function(err, result) {
                    cb(err, result)
                });
        });
}

/**
 * Properly set up request piping.
 * @param plugins
 * @param sourceRequest
 * @param sourceResponse
 * @param targetRequest
 * @private
 */
function subscribeToSourceRequestEvents(plugins, sourceRequest, sourceResponse, targetRequest) {
    const logger = logging.getLogger();

    // using apply on the array returned by getPluginHooksForEvent --> using a dummy object in place of this, which cannot be bound here.
    const onend_request_handlers = async.seq.apply({}, getPluginHooksForEvent('end', {
        plugins: plugins,
        sourceRequest: sourceRequest,
        sourceResponse: sourceResponse,
    }));

    var ondata_request_transform = new OnDataTransform({
        pluginHooks: getPluginHooksForEvent('data', {
            plugins: plugins,
            sourceRequest: sourceRequest,
            sourceResponse: sourceResponse
        })
    })

    sourceRequest.on('end', () => {
        onend_request_handlers(empty_buffer,
            function(err, result) {
                //opentracing
                traceHelper.endRequestSpan();
                //
                if (err) {
                    return logger.error(err);
                }

                if (result && result.length) {
                    targetRequest.write(result)
                }
            });
    });

    if ( (targetRequest.method === "GET") || (targetRequest.method === "HEAD") ) {
        targetRequest._hasBody = false;
    }

    sourceRequest
        .pipe(ondata_request_transform)
        .pipe(targetRequest);
}

/**
 * Properly set up response piping.
 * @param plugins
 * @param sourceRequest
 * @param sourceResponse
 * @param targetRequest
 * @param targetResponse
 * @param correlation_id
 * @param start
 * @param cb
 * @private
 */
function _subscribeToResponseEvents(plugins, sourceRequest, sourceResponse, targetRequest, targetResponse, correlation_id, start, cb) {
    const logger = logging.getLogger();
    //
    // using apply on the array returned by getPluginHooksForEvent --> using a dummy object in place of this, which cannot be bound here.
    const onend_response_handlers = async.seq.apply({}, getPluginHooksForEvent('end', {
        plugins: plugins,
        sourceRequest: sourceRequest,
        sourceResponse: sourceResponse,
        targetRequest: targetRequest,
        targetResponse: targetResponse
    }));

    var endStream = true;
    var accumulatePresent = plugins.some((p) => {
        return (p.id === 'accumulate-response');
    });

    var chunkedTransfer = (targetResponse.headers['transfer-encoding'] === 'chunked');

    if (accumulatePresent && chunkedTransfer) {
        endStream = false;
    }

    var ondata_response_transform = new OnDataTransform({
        pluginHooks: getPluginHooksForEvent('data', {
            plugins: plugins,
            sourceRequest: sourceRequest,
            sourceResponse: sourceResponse,
            targetRequest: targetRequest,
            targetResponse: targetResponse
        })
    });

    ondata_response_transform.on('end', () => {
        onend_response_handlers(empty_buffer,
            function(err, result) {
                if (err) {
                    logger.error(err);
                }

                if (result && result.length) {
                    sourceResponse.end(result);
                    debug('sourceResponse close', correlation_id, sourceResponse.statusCode);
                    logger.info({
                        res: sourceResponse,
                        d: Date.now() - start,
                        i: correlation_id
                    }, 'sourceResponse');
                } else {
                    sourceResponse.end();
                    debug('sourceResponse close', correlation_id, sourceResponse.statusCode);
                    logger.info({
                        res: sourceResponse,
                        d: Date.now() - start,
                        i: correlation_id
                    }, 'sourceResponse');
                }

                return cb(err, result);
            });
    });

    targetResponse
        .pipe(ondata_response_transform)
        .pipe(sourceResponse, {
            end: false
        });

    targetResponse.on('close', function() {
        debug('targetResponse close', correlation_id);
        logger.info({
            res: sourceResponse,
            d: Date.now() - start,
            i: correlation_id
        }, 'res close');
    });

    targetResponse.on('error', function(err) {
        logger.warn({
            res: targetResponse,
            d: Date.now() - start,
            i: correlation_id,
            err: err
        }, 'targetResponse error');

        debug('targetResponse error', correlation_id, err.stack);
        async.series(getPluginHooksForEvent('error', {
                plugins: plugins,
                sourceRequest: sourceRequest,
                sourceResponse: sourceResponse,
                targetRequest: targetRequest,
                targetResponse: targetResponse
            }),
            function(err) {
                cb(err)
            });
    });
}

const getPluginHooksForEvent = function(type, options) {
    const plugins = options.plugins;
    const pluginMap = plugins.map((plugin) => getPluginHookForEvent(plugin, type, options));
    return pluginMap;
};

function getPluginHookForEvent(plugin, type, options) {
    const isRequest = !options.targetRequest;
    const logger = logging.getLogger();
    //return handler
    return (data, cb) => {
        cb = _.isFunction(data) ? data : cb;
        data = _.isFunction(data) ? null : data;
        try {

            const handler = (type ? type + '_' : '') + (isRequest ? 'request' : 'response');
            if (plugin['on' + handler] && _.isFunction(plugin['on' + handler])) {
                const fx = function(e) {  // }, newData) {  // jshint but allowing arg to be passed without access to it
                    //a small fix introduced to fix issues with plugin API being inconsistent with documentation.
                    //Pass a second null to ondata_response event callback then you are able to override the response body
                    var args = Array.prototype.slice.call(arguments);
                    if (args.length === 2) {
                        cb(e, args[1]);
                    } else {
                        cb(e, data);
                    }
                };

                var pluginHandler = plugin['on' + handler];
                var argsLength = pluginHandler.length;
                var args = null;
                if (argsLength === 3) {
                    args = [options.sourceRequest, options.sourceResponse, fx];
                } else if (argsLength === 4) {
                    args = [options.sourceRequest, options.sourceResponse, data, fx];
                } else if (argsLength === 5) {
                    args = [options.sourceRequest, options.sourceResponse, options.targetResponse, data, fx];
                }

                pluginHandler.apply(null, args);
            } else {
                debug("plugin " + plugin.id + " does not provide handler function for " + handler);
                cb(null, data); // plugin does not provide onerror_request, carry on
            }
        } catch (handlerException) {
            logger.error(handlerException, plugin.id + " handler threw an exception")
            cb(handlerException)
        }

    }
}

module.exports.getPluginHookForEvent = getPluginHookForEvent;

const _configured = function(config, property) {
    if (config.headers) {
        const value = config.headers[property];
        return value ? value : _.isUndefined(value); // on if unspecified
    } else {
        return true; // on if no config.headers section
    }
};
