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
    ssl: {
      key: './tests/server2.key.pem',
      cert: './tests/server2.cert.pem',
      ca: './tests/ca-chain.cert.pem',
      passphrase: 'foobar'    
    }
  },
  proxies: [
    { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
  ]
}

var gateway
var server

const startGateway = (config, handler, done) => {
  server = restify.createServer({});

  server.use(restify.gzipResponse());
  server.use(restify.bodyParser());

  server.get('/', handler);

  server.listen(port, function() {
    console.log('%s listening at %s', server.name, server.url)

    gateway = gatewayService(config)

    done()
  })
}

describe('test ssl certificate authority configuration handling', () => {
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
    describe('ca', () => {
      // it('can request against an ssl with ca endpoint', (done) => {
      //   startGateway(baseConfig, (req, res, next) => {
      //     assert.equal('localhost:' + port, req.headers.host)
      //     res.end('OK')
      //   }, () => {
      //     gateway.start((err) => {
      //       assert(!err, err)

      //       request({
      //         method: 'GET',
      //         agentOptions: {
      //           key: fs.readFileSync('./tests/server2.key.pem'),
      //           cert: fs.readFileSync('./tests/server2.cert.pem'),
      //           ca: fs.readFileSync('./tests/ca-chain.cert.pem'),
      //           passphrase: 'foobar'
      //         },
      //         url: 'https://localhost:' + gatewayPort + '/v1'
      //       }, (err, r, body) => {
      //         assert(!err, err)
      //         assert.equal('OK', body)
      //         done()
      //       })
      //     })
      //   })
      // })
    })
  })
})
