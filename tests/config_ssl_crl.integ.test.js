const https = require('https');
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const edgeConfig = require('microgateway-config');
const gatewayService = require('../index');
const { getJWT } = require('./helper.js');
let { user, username, password, key, secret, org, env, tokenSecret, tokenId } = require('./env.js');
var gateway;
var jwtkn;
let helloWorldSrv;
let helloWorldSrvPort = 4435;
let config;
describe('Certificate Revocation List', () => {
  before(done => {
    helloWorldSrv = http
      .createServer((req, res) => {
        res.end('hello world');
      })
      .listen(helloWorldSrvPort, () => {
        done();
      });
  });
  after(done => {
    gateway.stop();
    helloWorldSrv.close();
    done();
  });
  describe('MGW SSL CRL', () => {
    it('MGW SSL w CRL does not block valid client cert', done => {
      edgeConfig.get(
        { keys: { key, secret }, source: `${__dirname}/fixtures/crl-config.yaml` },
        (err, configDownload) => {
          config = configDownload;
          config.edgemicro.ssl = {
            cert: `${__dirname}/fixtures/server-crt.pem`,
            key: `${__dirname}/fixtures/server-key.pem`,
            ca: `${__dirname}/fixtures/ca-crt.pem`,
            crl: `${__dirname}/fixtures/ca-crl.pem`,
            requestCert: true,
            rejectUnauthorized: true
          };

          config.proxies[0].url = `http://localhost:${helloWorldSrvPort}`;
          config.proxies[0].base_path = '/hello_world';
          gateway = gatewayService(config);
          gateway.start(function() {
            getJWT(function(tkn) {
              jwtkn = tkn;
              let options = {
                hostname: 'localhost',
                port: config.edgemicro.port,
                path: '/hello_world',
                method: 'GET',
                key: fs.readFileSync(__dirname + '/fixtures/client1-key.pem'),
                cert: fs.readFileSync(__dirname + '/fixtures/client1-crt.pem'),
                ca: fs.readFileSync(__dirname + '/fixtures/ca-crt.pem'),
                headers: {
                  Authorization: `Bearer ${tkn}`
                }
              };
              let req = https.request(options, res => {
                let dataStr = '';
                res.on('data', data => {
                  dataStr += `${data}`;
                  if (dataStr.includes('hello world')) done();
                });
              });
              req.end();
              req.on('error', err => {
                assert.equal(err, null);
                done();
              });
            });
          });
        }
      );
    });

    it('Refuses connection presenting revoked client cert', done => {
      let options = {
        hostname: 'localhost',
        port: config.edgemicro.port,
        path: '/hello_world',
        method: 'GET',
        key: fs.readFileSync(__dirname + '/fixtures/client2-key.pem'),
        cert: fs.readFileSync(__dirname + '/fixtures/client2-crt.pem'), //cert has been revoked on fixtures/ca-crl.pem
        ca: fs.readFileSync(__dirname + '/fixtures/ca-crt.pem'),
        headers: {
          Authorization: `Bearer ${jwtkn}`
        }
      };
      let req = https.request(options, res => {
        let dataStr = '';
        res.on('data', data => {
          dataStr += `${data}`;
          if (dataStr.includes('hello world')) {
            assert(false);
            done();
          }
        });
      });
      req.end();
      req.on('error', err => {
        assert.equal(err.code, 'ECONNRESET');
        done();
      });
    });
  });
});
