'use strict'

const _ = require('lodash')
const assert = require('assert')
const gatewayService = require('../index')
const request = require('request')
const restify = require('restify')
const should = require('should')
const fs = require('fs');

const gatewayPort = 8800
const port = 3300
const baseConfig = {
  edgemicro: {
    port: gatewayPort,
    logging: { level: 'info', dir: './tests/log' },
  },
  proxies: [
    { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
  ],
  headers: {
      "x-forwarded-for": true,
      "x-forwarded-host": true,
      "x-request-id": true,
      "x-response-time": true,
      "x-forwarded-proto": true,
      "via": true
  }
}

var gateway
var server

const startGateway = (config, handler, done) => {
  server = restify.createServer({});

  server.use(restify.plugins.gzipResponse());
  server.use(restify.plugins.bodyParser());

  server.get('/', handler);

  server.listen(port, function() {
    console.log('%s listening at %s', server.name, server.url)

    gateway = gatewayService(config)

    done()
  })
}

describe('test forwarding headers', () => {
  afterEach((done) => {
    if (gateway) {
      gateway.stop(() => {})
    }

    if (server) {
      server.close()
    }

    done()
  })

  describe('config', () => {
    describe('headers', () => {
      it('will set forwarded headers when set to true', (done) => {
        startGateway(baseConfig, (req, res, next) => {
          const headers = req.headers;
          //Random header that is populated it's <uuid>.<uuid>
          assert.ok(headers["x-request-id"])
          //calculated headers
          assert.equal(headers["x-forwarded-for"], "::ffff:127.0.0.1")
          assert.equal(headers["x-forwarded-host"], "localhost:8800")
          assert.equal(headers["via"], "1.1 localhost")
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert.ok(!err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.ok(r.headers["x-response-time"])
              assert.equal('OK', body)
              done()
            })
          })
        })
      })


      it('will not set forwarded headers when set to false', (done) => {
        var clonedConfig = _.clone(baseConfig)
        clonedConfig.headers["via"] = false;
        clonedConfig.headers["x-forwarded-for"] = false;
        clonedConfig.headers["x-request-id"] = false;
        clonedConfig.headers["x-forwarded-host"] = false;
        clonedConfig.headers["x-response-time"] = false;
        startGateway(clonedConfig, (req, res, next) => {
          const headers = req.headers;
          //Random header that is populated it's <uuid>.<uuid>
          assert.ok(!headers["x-request-id"])
          //calculated headers
          assert.ok(!headers["x-forwarded-for"])
          assert.ok(!headers["x-forwarded-host"])
          assert.ok(!headers["via"])
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.ok(!r.headers["x-response-time"])
              assert.equal('OK', body)
              done()
            })
          })
        })
      })


      it('will set x-forwarded-proto', (done) => {
        var clonedConfig = _.clone(baseConfig)
        clonedConfig.headers["x-forwarded-proto"] = true;
        startGateway(clonedConfig, (req, res, next) => {
          const headers = req.headers;
          assert.equal(headers["x-forwarded-proto"], "http")
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.equal('OK', body)
              done()
            })
          })
        })
      })

      it('will not set x-forwarded-proto if already set', (done) => {
        var clonedConfig = _.clone(baseConfig)
        clonedConfig.headers["x-forwarded-proto"] = true;
        startGateway(clonedConfig, (req, res, next) => {
          const headers = req.headers;
          assert.equal(headers["x-forwarded-proto"], "https")
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              headers: {
                'x-forwarded-proto': 'https'
              },
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.equal('OK', body)
              done()
            })
          })
        })
      })


      it('will not set x-forwarded-proto', (done) => {
        var clonedConfig = _.clone(baseConfig)
        clonedConfig.headers["x-forwarded-proto"] = false;
        startGateway(clonedConfig, (req, res, next) => {
          const headers = req.headers;
          assert.ok(!headers["x-forwarded-proto"])
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.equal('OK', body)
              done()
            })
          })
        })
      })
    })
  })
})