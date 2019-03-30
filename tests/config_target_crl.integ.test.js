const https = require('https');
const assert = require('assert');
const fs = require('fs');
const request = require('request');
const edgeConfig = require('microgateway-config');
const gatewayService = require('../index');
const { getJWT } = require('./helper.js');
let gateway;
let jwtkn;
let config = {};
let { user, username, password, key, secret, org, env, tokenSecret, tokenId } = require('./env.js');
let configPath = `${__dirname}/fixtures/crl-config.yaml`; //set to edgemicro config file path

let options = {
  ca: fs.readFileSync(`${__dirname}/fixtures/ca-crt.pem`),
  requestCert: true,
  rejectUnauthorized: true
};

let srv1Opts = {
  key: fs.readFileSync(`${__dirname}/fixtures/server-key.pem`),
  cert: fs.readFileSync(`${__dirname}/fixtures/server-crt.pem`)
};

let srv1 = https.createServer({ ...options, ...srv1Opts }, (req, res) => {
  res.end('hello world valid\n');
});

let srv2Opts = {
  key: fs.readFileSync(`${__dirname}/fixtures/server-key2.pem`),
  cert: fs.readFileSync(`${__dirname}/fixtures/server-crt2.pem`)
};
//srv2 uses a cert revoked on fixtures/ca-crl.pem
let srv2 = https.createServer({ ...options, ...srv2Opts }, (req, res) => {
  res.end('hello world invalid\n');
});

const srv1Port = 8433;
const srv2Port = 8434;

describe('Certificate Revocation List', () => {
  before(done => {
    srv1.listen(srv1Port, () => {
      srv2.listen(srv2Port, () => {
        done();
      });
    });
  });

  after(done => {
    gateway.stop();
    srv1.close();
    srv2.close();
    done();
  });
  describe('Outbound Target Server CRL', () => {
    it('Does not block valid certs', done => {
      edgeConfig.get({ keys: { key, secret }, source: configPath }, (err, configDownload) => {
        config = configDownload;
        config.edgemicro = {
          port: 8000,
          logging: { level: 'info', dir: './tests/log' }
        };
        config.targets = [
          {
            host: 'localhost',
            ssl: {
              client: {
                cert: `${__dirname}/fixtures/client1-crt.pem`,
                key: `${__dirname}/fixtures/client1-key.pem`,
                ca: `${__dirname}/fixtures/ca-crt.pem`,
                crl: `${__dirname}/fixtures/ca-crl.pem`,
                rejectUnauthorized: true
              }
            }
          }
        ];
        config.proxies[0] = {};
        config.proxies[1] = {};
        config.proxies[0].url = `https://localhost:${srv1Port}/`;
        config.proxies[0].base_path = '/edgemicro_testcrl01';
        config.proxies[1].url = `https://localhost:${srv2Port}/`;
        config.proxies[1].base_path = '/edgemicro_testcrl02';

        gateway = gatewayService(config);
        gateway.start(() => {
          getJWT(tkn => {
            jwtkn = tkn;
            request(
              {
                method: 'get',
                uri: `http://localhost:${config.edgemicro.port}/edgemicro_testcrl01`,
                auth: {
                  bearer: tkn
                },
                json: true
              },
              (err, resp, body) => {
                if (err) console.error('crl02 err', err);
                assert.equal(err, null);
                assert.equal(resp.statusCode, 200);
                assert(body.includes('hello world valid'));
                done();
              }
            );
          });
        });
      });
    });

    it('Blocks revoked certs', done => {
      request(
        {
          method: 'get',
          uri: `http://localhost:${config.edgemicro.port}/edgemicro_testcrl02`,
          auth: {
            bearer: jwtkn
          },
          json: true
        },
        (err, resp, body) => {
          if (err) console.error('err crl02', err);
          assert.equal(resp.statusCode, 502);
          assert.equal(body.message, 'certificate revoked');
          assert.equal(body.code, 'CERT_REVOKED');
          done();
        }
      );
    });
  });
});
