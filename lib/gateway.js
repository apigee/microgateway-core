'use strict'

const http = require('http')
const https = require('https')
const debug = require('debug')('gateway:init')
const path = require('path')
const fs = require('fs')
const async = require('async')
const configProxyFactory = require('./config-proxy-middleware')
const pluginsFactory = require('./plugins-middleware')
const errorsLib = require('./errors-middleware')
const logging = require('./logging')
const assert = require('assert')
const configService = require('./config')

//http server 
var server;

/**
 *
 * @param config
 * @param plugins plugin handlers loaded into memory
 * @param cb function(err,httpserver){}
 * @returns {*}
 */
module.exports.start = function (plugins, cb) {
  try {
    var config = configService.get()

    assert(config, ' must have a config')
    const logger = logging.getLogger()

    const configProxy = configProxyFactory()
    const pluginsMiddleware = pluginsFactory(plugins)
    const errors = errorsLib(config, logger)

    const serverMiddleware = function (req, res) {
      async.series([
        function (cb) {
          configProxy(req, res, cb)
        },
        function (cb) {
          pluginsMiddleware(req, res, cb)
        }
      ],
        function (err) {
          errors(err, req, res)
        })
    }

    // TODO virtualhost / proxy level ssl
    if (config.system.ssl) {
      // Paths to certificate info must be absolute paths
      const options = {
        key: fs.readFileSync(path.resolve(config.system.ssl.key), 'utf8'),
        cert: fs.readFileSync(path.resolve(config.system.ssl.cert), 'utf8')
      }

      server = https.createServer(options, serverMiddleware)
    } else {
      server = http.createServer(serverMiddleware)
    }

    server.on('error', function (err, req, res) {
      res && res.writeHead(500, {
        'Content-Type': 'application/json'
      })
      
      logger.error(err,"failed in error handler");    
      
      res && res.end({"message":err});
      cb(err);
    });

    // place a hard limit on incoming connections (if configured)
    // the server will reject any more incoming connection once this limit is reached
    // see https://nodejs.org/api/net.html#net_server_maxconnections
    const maxConnections = config.system.max_connections_server
    if (maxConnections && typeof maxConnections === 'number' && maxConnections > 0) {
      server.maxConnections = maxConnections
    }

    if (config.system.address) {
      server.listen(config.system.port, config.system.address, function (err) {
        if (err) {
          return cb(err)
        }

        console.info(config.uid, 'edge micro listening on', config.system.address + ':' + server.address().port)
        cb(null, server)
      })
    } else {
      server.listen(config.system.port, function (err) {
        if (err) {
          return cb(err)
        }

        console.info(config.uid, 'edge micro listening on port', server.address().port)
        cb(null, server)
      })
    }

  } catch (err) {
    cb(err)
  }

}

module.exports.stop = function stop (cb) {
  if (server) {
    server.close(cb)
    server = undefined
  }
}
