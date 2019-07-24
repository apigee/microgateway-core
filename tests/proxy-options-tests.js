var BuildNonTunnelOptions = require('../lib/build-non-tunnel-options');
var assert = require('assert');
var url = require('url');

describe('Building non tunnel options', ()=> {
    it('Will properly build non tunnel options for the given inputs', ()=> {
        var proxy = {
            secure: true
        };

        var proxyConfig = {
            proxy: 'http://localhost:8080'
        };

        var requestOptions = {
            path: '/',
            hostname: 'localhost',
            port: 9090,
            agent: false, 
            method: 'GET',
            headers: {
                'foo': 'bar'
            }
        };

        var opts = BuildNonTunnelOptions(proxy, requestOptions, proxyConfig.proxy);
        
        var path = 'https://localhost:9090/';

        assert.equal(opts.path, path);
        assert.equal(opts.method, 'GET');
        assert.equal(opts.agent, false);
        assert.equal(opts.hostname, 'localhost');
        assert.equal(opts.port, '8080');
        assert.equal(opts.headers.foo, 'bar');
    });

    it('Will properly build non tunnel options for the path supplied', ()=> {
        var proxy = {
            secure: true
        };

        var proxyConfig = {
            proxy: 'http://localhost:8080'
        };

        var requestOptions = {
            path: '/?foo=bar',
            hostname: 'localhost',
            port: 9090,
            agent: false, 
            method: 'GET',
            headers: {
                'foo': 'bar'
            }
        };

        var opts = BuildNonTunnelOptions(proxy, requestOptions, proxyConfig.proxy);
        
        var path = 'https://localhost:9090/?foo=bar';

        assert.equal(opts.path, path);
        assert.equal(opts.method, 'GET');
        assert.equal(opts.agent, false);
        assert.equal(opts.hostname, 'localhost');
        assert.equal(opts.port, '8080');
        assert.equal(opts.headers.foo, 'bar');
    });

    it('Will properly build non tunnel options for the non-secure proxy supplied', ()=> {
        var proxy = {
            secure: false
        };

        var proxyConfig = {
            proxy: 'http://localhost:8080'
        };

        var requestOptions = {
            path: '/?foo=bar',
            hostname: 'localhost',
            port: 9090,
            agent: false, 
            method: 'GET',
            headers: {
                'foo': 'bar'
            }
        };

        var opts = BuildNonTunnelOptions(proxy, requestOptions, proxyConfig.proxy);
        
        var path = 'http://localhost:9090/?foo=bar';

        assert.equal(opts.path, path);
        assert.equal(opts.method, 'GET');
        assert.equal(opts.agent, false);
        assert.equal(opts.hostname, 'localhost');
        assert.equal(opts.port, '8080');
        assert.equal(opts.headers.foo, 'bar');
    });
});
