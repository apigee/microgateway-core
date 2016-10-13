'use strict';

const http = require('http');
const https = require('https');
const path = require('path');
const url = require('url');
const uuid = require('uuid');
const _ = require('lodash');
const async = require('async');
const debug = require('debug')('gateway:main');
const configService = require('./config');
const logging = require('./logging')
const double_slash_regex = /\/\/+/g;
const empty_buffer = new Buffer(0);
const assert = require('assert');
const stats = require('./stats')


/**
 * injects plugins into gateway
 * @param plugins
 * @returns {Function(req,res,cb)}
 */
module.exports = function(plugins) {
  const logger = logging.getLogger();

  return function(sourceRequest, sourceResponse, next) {
    const startTime = Date.now();
    const promises = [];
    const correlation_id = uuid.v1();
    logger.info({ req: sourceRequest, i: correlation_id }, 'sourceRequest');
    debug('sourceRequest', correlation_id, sourceRequest.method, sourceRequest.url);
    //process the requests
    async.series(
      //onrequest
      _executePluginHandlers(null, {
        plugins: plugins,
        sourceRequest: sourceRequest,
        sourceResponse: sourceResponse
      }),
      function(err) {
        if (_.isBoolean(err) && err) {
          return next(false);
        }
        if (err) {
          stats.incrementStatusCount(sourceResponse.statusCode);
          return next(err)
        }
        //get the response
        const targetRequest = _sendTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id,
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
              promises: promises
            };

            _handleTargetResponse(targetRequest, targetResponse, options, function(err, results) {
              if (err) {
                next(err);
              }
              sourceResponse.end(results);
              next();
            })
          });

        _subscribeToSourceRequestEvents(plugins, promises, sourceRequest, sourceResponse, targetRequest);
        targetRequest.on('close', function() {
          debug('sourceRequest close');
        });
      });
  }
};

/**
 * call the target server to send the source request
 * @param plugins
 * @param correlation_id
 * @param sourceRequest
 * @param sourceResponse
 * @param cb
 * @private
 */
function _sendTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb) {

  const logger = logging.getLogger();
  const config = configService.get();

  const reqUrl = sourceRequest.reqUrl;
  const proxy = sourceResponse.proxy;

  // try to pass through most of the original request headers unmodified
  const target_headers = _.clone(sourceRequest.headers);

  if (_configured(config, 'x-request-id')) {
    // https://devcenter.heroku.com/articles/http-request-id
    target_headers['x-request-id'] =
      config.uid + '.' + correlation_id.toString();
  }

  if (_configured(config, 'x-forwarded-for')) {
    // append client address to the x-forwarded-for header
    var forwarded_for = target_headers['x-forwarded-for'];
    forwarded_for += forwarded_for ? ', ' : '';

    forwarded_for += sourceRequest.socket.remoteAddress;
    target_headers['x-forwarded-for'] = forwarded_for;
  }

  var hostname = target_headers.host;
  if (hostname) { // might be missing (with an http-1.0 client for example)

    if (_configured(config, 'x-forwarded-host')) {
      // append host heeader to the x-forwarded-host header
      var forwarded_host = target_headers['x-forwarded-host'];
      forwarded_host += forwarded_host ? ', ' : '';
      forwarded_host += hostname;
      target_headers['x-forwarded-host'] = forwarded_host;
    }

    const colon = hostname.indexOf(':');
    if (colon > 0) {
      hostname = hostname.substring(0, colon); // strip port if present
    }

    if (_configured(config, 'via')) {
      // append our hostname (but not the port), if present, to the via header
      var via = target_headers['via'];
      via += via ? ', ' : '';
      via += sourceRequest.httpVersion + ' ' + hostname;
      target_headers['via'] = via;
    }

    // To avoid breaking backard compatibility, we need to remove the "Host" header unless explicitly told not to
    const resetHostHeader = config.headers && typeof config.headers.host !== 'undefined' ? config.headers.host : true;

    if (resetHostHeader === true) {
      delete target_headers.host;
    }

    // delete the original content-length to let node fill it in for the target request
    if (target_headers['content-length']) {
      delete target_headers['content-length'];
    }
  }

  var target_path =
    proxy.parsedUrl.pathname + reqUrl.pathname.substr(proxy.basePathLength, reqUrl.pathname.length); // strip leading base_path

  target_path = target_path.replace(double_slash_regex, '/'); // remove any unintended double slashes
  target_path += reqUrl.search || ''; // append the search string if necessary

  const httpLibrary = proxy.secure ? https : http;
  assert(httpLibrary.request, 'must have request method');

  var agentOptions = {
    maxSockets: limit(proxy.max_connections), // limit target connections
    keepAlive: true
  };

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
      agentOptions = _.merge(agentOptions, httpsOptions);
    }
    // check for client ssl options
  }

  var agent = new httpLibrary.Agent(agentOptions);

  const targetRequestOptions = {
    hostname: proxy.parsedUrl.hostname,
    port: proxy.parsedUrl.port,
    path: target_path,
    method: sourceRequest.method,
    headers: target_headers, // pass through the modified headers
    agent: proxy.agent
  };

  const targetRequest = httpLibrary.request(targetRequestOptions,
    (targetResponse) => {

      cb(null, targetResponse);

    });

  targetRequest.on('error', function(err) {
    const logInfo = {
      m: targetRequestOptions.method,
      u: targetRequestOptions.path,
      h: targetRequestOptions.hostname + ':' + targetRequestOptions.port,
      i: correlation_id
    };
    logger.warn({ req: logInfo, d: Date.now() - startTime, i: correlation_id, err: err }, 'targetRequest error');
    debug('targetRequest error', correlation_id, err.stack);
    async.series(_executePluginHandlers('error', {
      plugins: plugins,
      sourceRequest: sourceRequest,
      sourceResponse: sourceResponse
    }),
      function(e) {
        if (e) {
          logger.error(e);
          cb(e);
        } else {
          sourceResponse.statusCode = 502; // Bad Gateway
          cb(err);
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

};

/**
 *
 * @param targetRequest
 * @param targetResponse
 * @param options {start, correlation_id, plugins, sourceRequest, sourceResponse,promises}
 * @param cb
 * @private
 */
function _handleTargetResponse(targetRequest, targetResponse, options, cb) {
  const start = options.start;
  const correlation_id = options.correlation_id;
  const plugins = options.plugins;
  const sourceRequest = options.sourceRequest;
  const sourceResponse = options.sourceResponse;
  const logger = logging.getLogger();
  const config = configService.get();
  const promises = options.promises;

  logger.info({ res: targetResponse, d: Date.now() - start, i: correlation_id }, 'targetResponse');
  debug('targetResponse', correlation_id, targetResponse.statusCode);
  const promise = new Promise(function(resolve, reject) {
    async.series(
      //onresponse
      _executePluginHandlers(null, {
        plugins: plugins,
        sourceRequest: sourceRequest,
        sourceResponse: sourceResponse,
        targetRequest: targetRequest,
        targetResponse: targetResponse
      }),
      function(err, results) {
        err && logger.error(err);
        if (sourceResponse.finished || sourceResponse.headersSent) {
          logger.error("response finished before work can be done");
          reject("response finished before work can be done");
          return;
        }

        if (err) {
          return reject(err);
        }

        debug(results);
        stats.incrementStatusCount(targetResponse.statusCode);
        stats.incrementResponseCount();
        // the size of the body will change if any of the plugins transform the content
        // delete the response content-length and let node recalculate it for the client request
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

        if (_configured(config, 'x-response-time')) {
          sourceResponse.setHeader('x-response-time', Date.now() - start);
        }
        resolve();

      });
  });
  promises.push(promise);
  _subscribeToResponseEvents(plugins, promises, sourceRequest, sourceResponse, targetRequest, targetResponse, correlation_id, start,
    function(err, result) {
      cb(err, result)
    });

};

function _subscribeToSourceRequestEvents(plugins, promises, sourceRequest, sourceResponse, targetRequest) {
  const logger = logging.getLogger();
  // write body
  sourceRequest.on('data', function(data) {
    const promise = new Promise((resolve, reject) => {
      debug('req data', data ? data.length : 'null');
      async.seq.apply(this,
        _executePluginHandlers('data', {
          plugins: plugins,
          sourceRequest: sourceRequest,
          sourceResponse: sourceResponse
        }))(data,
        function(err, result) {
          if (err) {
            logger.error(err);
            return reject(err);
          }
          result && targetRequest.write(result); // write transformed data to target
          resolve();
        });
    });
    promises.push(promise);

  });

  sourceRequest.on('end', function() {
    const promisesBefore = promises.slice();
    const promise = new Promise((resolve, reject) => {

      Promise.all(promisesBefore)
        .then(
        () => { //resolve
          debug('req end');
          async.seq.apply(this, _executePluginHandlers('end', {
            plugins: plugins,
            sourceRequest: sourceRequest,
            sourceResponse: sourceResponse
          }))(empty_buffer,
            function(err, result) {
              if (err) {
                logger.error(err);
                return reject(err);
              }
              targetRequest.end(result); // write transformed data to target
              resolve();
            });
        },
        (err) => { //reject
          reason && logger.error(err);
          reject(err)
        })
        .catch((err) => {
          logger.error(err, 'all promises were rejected')
          reject(err)
        })
    });
    promises.push(promise);

  });

  return promises;
};

function _subscribeToResponseEvents(plugins, promises, sourceRequest, sourceResponse, targetRequest, targetResponse, correlation_id, start, cb) {
  const logger = logging.getLogger();
  const resolved = false;
  targetResponse.on('data', function(data) {

    const promisesBefore = promises.slice();
    const promise = new Promise(function(resolve, reject) {

      Promise.all(promisesBefore)
        .then(
        () => { //resolve
          if (data && !sourceResponse.finished) {
            async.seq.apply(this, _executePluginHandlers('data', {
              plugins: plugins,
              sourceRequest: sourceRequest,
              sourceResponse: sourceResponse,
              targetRequest: targetRequest,
              targetResponse: targetResponse
            }))(data,
              function(err, result) {
                err && logger.error(err);
                if (err) {
                  return reject(err);
                }
                if (result) {
                  sourceResponse.write(result);
                  !resolved && resolve();
                } // write transformed data to response
                else {
                  !resolved && resolve();
                }
              });
          } else {
            if (data) {
              logger.warn({ res: targetResponse, i: correlation_id }, 'discarding data received after response sent');
            }
            resolve();
          }
        },
        (err) => { //reject
          err && logger.error(err);
          reject(err)
        })
        .catch((err) => {
          logger.error(err, 'all promises were rejected')
          reject(err)
        })

    });
    promises.push(promise)
  });


  targetResponse.on('end', function() {
    Promise.all(promises)
      .then(
      () => { //resolve
        logger.info({ res: sourceResponse, d: Date.now() - start, i: correlation_id }, 'res');
        debug('targetResponse end', correlation_id, targetResponse.statusCode);
        async.seq.apply(this, _executePluginHandlers('end', {
          plugins: plugins,
          sourceRequest: sourceRequest,
          sourceResponse: sourceResponse,
          targetRequest: targetRequest,
          targetResponse: targetResponse
        }))(
          empty_buffer,
          function(err, result) {
            err && logger.error(err);
            cb(err, result)
          });
      },
      (err) => { //reject
        err && logger.error(err);
        cb(err);
      })
      .catch((err) => {
        logger.error(err, 'all promises were rejected')
        cb(err);
      })

  });

  targetResponse.on('close', function() {
    debug('targetResponse close', correlation_id);
    logger.info({ res: sourceResponse, d: Date.now() - start, i: correlation_id }, 'res close');
  });

  targetResponse.on('error', function(err) {
    const promise = new Promise(function(resolve, reject) {

      logger.warn({
        res: targetResponse,
        d: Date.now() - start,
        i: correlation_id,
        err: err
      }, 'targetResponse error');

      debug('targetResponse error', correlation_id, err.stack);
      async.series(_executePluginHandlers('error', {
        plugins: plugins,
        sourceRequest: sourceRequest,
        sourceResponse: sourceResponse,
        targetRequest: targetRequest,
        targetResponse: targetResponse
      }),
        function(e) {
          const error = e || err;
          reject(error);
        });
    });
    promises.push(promise);
  });
}

const _executePluginHandlers = function(type, options) {
  const plugins = options.plugins;
  const pluginMap = plugins.map((plugin) => _executePluginHandler(plugin, type, options));
  return pluginMap;
};

function _executePluginHandler(plugin, type, options) {
  const isRequest = !options.targetRequest;
  const logger = logging.getLogger();
  //return handler
  return (data, cb) => {
    cb = _.isFunction(data) ? data : cb;
    data = _.isFunction(data) ? null : data;
    try {

      const handler = (type ? type + '_' : '') + (isRequest ? 'request' : 'response');
      if (plugin['on' + handler] && _.isFunction(plugin['on' + handler])) {
        const fx = function(e, newData) {
          //a small fix introduced to fix issues with plugin API being inconsistent with documentation.
          //Pass a second null to ondata_response event callback then you are able to override the response body
          var args = Array.prototype.slice.call(arguments);
          if(args.length == 2) {
            cb(e, args[1]);
          } else {
            cb(e, data);
          }
        };
        plugin['on' + handler](options.sourceRequest, options.sourceResponse,
          plugin['on' + handler].length === 3 ? fx : data, //if 3 args must be the older style
          fx)
      } else {
        debug("plugin " + plugin.id + " does not provide handler function for " + handler);
        cb(null, data); // plugin does not provide onerror_request, carry on
      }
    } catch (handlerException) {
      logger.error(handlerException, plugin.id + " handler threw an exception")
      cb(handlerException)
    }

  }
};


const _configured = function(config, property) {
  if (config.headers) {
    const value = config.headers[property];
    return value ? value : _.isUndefined(value); // on if unspecified
  } else {
    return true; // on if no config.headers section
  }
};

function limit(value) {
  // use value if configured, numeric and positive, otherwise unlimited
  return value && typeof value === 'number' && value > 0 ? value : Infinity;
}
