'use strict'

const _ = require('lodash')
const assert = require('assert')
const gatewayService = require('../index')
const request = require('request')
const http = require('http')
const should = require('should')
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const url = require('url');
const util = require('util');

const gatewayPort = 8800
const proxyPort = 4490;
const port = 3300

var gateway
var proxy
var server

const startGateway = (config, handler, done) => {

  //This is a mock proxy server. 
  //Meant to replicate a squid proxy in basic functionality for testing purposes.
  proxy = http.createServer((req, res) => {
    var r = request({
      url: req.url,
      method: req.method,
      headers: req.headers
    });

    req.pipe(r).pipe(res);
  }).on('connect', (req, cltSocket, head) => {
    
    var proto, netLib;
    if(req.url.indexOf('443') > -1) {
      proto = 'https';
      netLib = tls;
    } else {  
      proto = 'http';
      netLib = net;
    }

    const connectionCb = () => {
      cltSocket.write([
        'HTTP/1.1 200 Connection Established\r\n', 
        'Proxy-agent: Node.js-Proxy\r\n',
        '\r\n'
        ].join(''));

      targetConnection.write(head);
      targetConnection.pipe(cltSocket);
      cltSocket.pipe(targetConnection);
    } 

    var targetUrl = url.parse(util.format('%s://%s', proto, req.url));

    var targetConnection; 
    if(proto == 'http') {
      targetConnection = netLib.connect(targetUrl.port, targetUrl.hostname, connectionCb)
    } else {
      if(targetUrl.hostname == 'localhost') {
        try {
          targetConnection = netLib.connect(opts, targetUrl.port, targetUrl.hostname, connectionCb);
        } catch(e) {
          console.log('Error connecting.');
          console.log(e);
        }
      } else {
        try {
          targetConnection = netLib.connect(targetUrl.port, targetUrl.hostname, connectionCb);
        } catch(e) {
          console.log('Error connecting.');
          console.log(e);
        }
      }
    }
  });

  server = http.createServer(handler);

  server.listen(port, function() {
    console.log('API Server listening at %s', JSON.stringify(server.address()))

    proxy.listen(proxyPort, function(){
      console.log('Proxy Server listening at %s',JSON.stringify(server.address()))
      gateway = gatewayService(config)

      done()
    }); 
    
  })
}

describe('test configuration handling', () => {
  afterEach((done) => {
    if (gateway) {
      gateway.stop(() => {})
    }

    if (server) {
      server.close()
      proxy.close()
    }

    if(process.env.NO_PROXY) {
      process.env.NO_PROXY = undefined;
    }

    done()
  })

  describe('proxy', () => {
    describe('non tunneling http proxy', () => {
      it('route traffic through an http proxy', (done) => {
        
        const baseConfig = {
          edgemicro: {
            port: gatewayPort,
            logging: { level: 'info', dir: './tests/log' },
            proxy: 'http://localhost:' + proxyPort
          },
          proxies: [
            { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
          ]
        }

        startGateway(baseConfig, (req, res) => {
          assert.equal('localhost:' + proxyPort, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert.ok(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err, err)
              assert.equal(r.statusCode, 200)
              done()
            })
          })
        })
      })

      it('will respect the no_proxy variable', (done) => {
        
        process.env.NO_PROXY = 'localhost'
        const baseConfig = {
          edgemicro: {
            port: gatewayPort,
            logging: { level: 'info', dir: './tests/log' },
            proxy: 'http://localhost:' + proxyPort
          },
          proxies: [
            { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
          ]
        }

        startGateway(baseConfig, (req, res) => {
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert.ok(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err, err)
              assert.equal(r.statusCode, 200)
              done()
            })
          })
        })
      })

      it('route traffic through an http proxy with forced non-tunneling', (done) => {
        
        const baseConfig = {
          edgemicro: {
            port: gatewayPort,
            logging: { level: 'info', dir: './tests/log' },
            proxy: 'http://localhost:' + proxyPort,
            proxy_tunnel: false
          },
          proxies: [
            { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
          ]
        }

        startGateway(baseConfig, (req, res) => {
          assert.equal('localhost:' + proxyPort, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert.ok(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err, err)
              assert.equal(r.statusCode, 200)
              done()
            })
          })
        })
      })

      it('route traffic through an http proxy with forced tunneling', (done) => {
        
        const baseConfig = {
          edgemicro: {
            port: gatewayPort,
            logging: { level: 'info', dir: './tests/log' },
            proxy: 'http://localhost:' + proxyPort,
            proxy_tunnel: true
          },
          proxies: [
            { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
          ]
        }

        startGateway(baseConfig, (req, res) => {
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert.ok(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err, err)
              assert.equal(r.statusCode, 200)
              done()
            })
          })
        })
      })

      it('wont route traffic through an http proxy with forced tunneling with no_proxy', (done) => {
        
        process.env.NO_PROXY = 'localhost'
        const baseConfig = {
          edgemicro: {
            port: gatewayPort,
            logging: { level: 'info', dir: './tests/log' },
            proxy: 'http://localhost:' + proxyPort,
            proxy_tunnel: true
          },
          proxies: [
            { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
          ]
        }

        startGateway(baseConfig, (req, res) => {
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert.ok(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err, err)
              assert.equal(r.statusCode, 200)
              done()
            })
          })
        })
      })

    })
  })
})
