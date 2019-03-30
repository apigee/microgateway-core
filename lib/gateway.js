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
module.exports.start = function(plugins, cb) {
    try {
        var config = configService.get()

        assert(config, ' must have a config')
        const logger = logging.getLogger()

        const configProxy = configProxyFactory()
        const pluginsMiddleware = pluginsFactory(plugins)
        const errors = errorsLib(config, logger)

        const serverMiddleware = function(req, res) {
            //capture request time
            req.reqStartTimestamp = Date.now();

            async.series([
                    function(cb) {
                        configProxy(req, res, cb)
                    },
                    function(cb) {
                        pluginsMiddleware(req, res, cb)
                    }
                ],
                function(err) {
                    errors(err, req, res)
                    if (err) {
                        var traceHelper = require('./trace-helper');
                        traceHelper.finishRequestSpan();
                    }
                })
        }

        if (config.edgemicro.ssl) {
            // Paths to certificate info must be absolute paths
            const options = {
                passphrase: config.edgemicro.ssl.passphrase,
                ca: config.edgemicro.ssl.ca,
                ciphers: config.edgemicro.ssl.ciphers,
                rejectUnauthorized: config.edgemicro.ssl.rejectUnauthorized,
                requestCert: config.edgemicro.ssl.requestCert,
                secureProtocol: config.edgemicro.ssl.secureProtocol,
                servername: config.edgemicro.ssl.servername,
                crl: config.edgemicro.ssl.crl
            }

            var key = config.edgemicro.ssl.key;
            var cert = config.edgemicro.ssl.cert;
            var pfx = config.edgemicro.ssl.pfx;
            var ca = config.edgemicro.ssl.ca;
            var crl = config.edgemicro.ssl.crl;

            if (key && cert) {
                options.key = fs.readFileSync(path.resolve(key), 'utf8');
                options.cert = fs.readFileSync(path.resolve(cert), 'utf8');
            }

            if (ca) {
                options.ca = fs.readFileSync(path.resolve(ca), 'utf8');
            }

            if (pfx) {
                //fix: do not read pfx as utf-8
                options.pfx = fs.readFileSync(path.resolve(pfx));
            }

            if (crl) {
                options.pfx = fs.readFileSync(path.resolve(crl));
            }

            server = https.createServer(options, serverMiddleware)
        } else {
            server = http.createServer(serverMiddleware)
        }

        server.setTimeout(0);

        server.on('connection', (socket) => {
            //enable TCP_NODELAY
            if (config.edgemicro.nodelay === true) {
                debug("tcp nodelay set");
                socket.setNoDelay(true);
            }
        });

        server.on('error', function(err, req, res) {
            res && res.writeHead(500, {
                'Content-Type': 'application/json'
            })

            logger.error(err, "failed in error handler");

            res && res.end({
                "message": err
            });
            cb(err);
        });

        // place a hard limit on incoming connections (if configured)
        // the server will reject any more incoming connection once this limit is reached
        // see https://nodejs.org/api/net.html#net_server_maxconnections
        const maxConnections = config.edgemicro.max_connections
        if (maxConnections && typeof maxConnections === 'number' && maxConnections > 0) {
            server.maxConnections = maxConnections
        }


        if (config.edgemicro.address) {
            server.listen(config.edgemicro.port, config.edgemicro.address, function(err) {
                if (err) {
                    return cb(err)
                }

                console.info(config.uid, 'edge micro listening on', config.edgemicro.address + ':' + server.address().port)
                cb(null, server)
            })
        } else {
            server.listen(config.edgemicro.port, function(err) {
                if (err) {
                    return cb(err)
                }

                logger.info({
                    uid: config.uid,
                    port: server.address().port
                }, config.uid + ' edge micro listening on port ' + server.address().port);
                cb(null, server)
            })
        }

    } catch (err) {
        cb(err)
    }

}

module.exports.stop = function stop(cb) {
    if (server) {
        server.close(cb)
        server = undefined
    }
}
