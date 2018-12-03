const assert = require('assert');
const NoProxyParseAndMatch = require('../lib/no-proxy-parser');

describe('no proxy variable parsing and matching', () => {
  it('will parse and match a host in the list', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost/', 'localhost');
    assert.equal(matched, true);
  });

  it('will parse and not match a host in the list', ()=> {
    const matched = NoProxyParseAndMatch('http://foo.bar/', 'localhost');
    assert.equal(matched, false);
  });

  it('will parse and match a host with port in the list', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost:8080/', 'localhost:8080');
    assert.equal(matched, true);
  });

  it('will parse and not match a host with port in the list', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost:8081/', 'localhost:8080');
    assert.equal(matched, false);
  });

  it('will parse and match a host with default TLS port in the list', ()=> {
    const matched = NoProxyParseAndMatch('https://localhost/', 'localhost:443');
    assert.equal(matched, true);
  });

  it('will parse and match a host with default HTTP port in the list', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost/', 'localhost:80');
    assert.equal(matched, true);
  });

  it('will parse and match a host regardless of port information', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost:8080/', 'localhost');
    assert.equal(matched, true);
  });

  it('will return false if the no_proxy variable is undefined.', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost:8080/', undefined);
    assert.equal(matched, false);
  });

  it('will return false if the no_proxy variable is null.', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost:8080/', null);
    assert.equal(matched, false);
  });

  it('will return false if the no_proxy variable is an empty string.', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost:8080/', '');
    assert.equal(matched, false);
  });

  it('will return false if the host variable is undefined.', ()=> {
    const matched = NoProxyParseAndMatch(undefined, 'localhost');
    assert.equal(matched, false);
  });

  it('will return false if the host variable is null.', ()=> {
    const matched = NoProxyParseAndMatch(null, 'localhost');
    assert.equal(matched, false);
  });

  it('will return false if the host variable is an empty string.', ()=> {
    const matched = NoProxyParseAndMatch('', 'localhost');
    assert.equal(matched, false);
  });

  it('will parse and match a host when no proxy is comma delimited list', ()=> {
    const matched = NoProxyParseAndMatch('http://localhost/', 'localhost,foo.bar,bar.baz');
    assert.equal(matched, true);
  });

  it('will parse and match a host that is second in list when no proxy is comma delimited list', ()=> {
    const matched = NoProxyParseAndMatch('http://foo.bar/', 'localhost,foo.bar,bar.baz');
    assert.equal(matched, true);
  });

  it('will parse and match a host that is last in list when no proxy is comma delimited list', ()=> {
    const matched = NoProxyParseAndMatch('http://bar.baz/', 'localhost,foo.bar,bar.baz');
    assert.equal(matched, true);
  });


  it('will parse and match a host with port that is second in list when no proxy is comma delimited list', ()=> {
    const matched = NoProxyParseAndMatch('http://foo.bar:8080/', 'localhost,foo.bar:8080,bar.baz');
    assert.equal(matched, true);
  });

  it('will parse and match a host with port that is last in list when no proxy is comma delimited list', ()=> {
    const matched = NoProxyParseAndMatch('http://bar.baz:8080/', 'localhost,foo.bar,bar.baz:8080');
    assert.equal(matched, true);
  });

  it('will not partially match hosts', () => {
    const matched = NoProxyParseAndMatch('http://ar.baz:8080/', 'localhost,foo.bar,bar.baz:8080');
    assert.equal(matched, false);
  });

  it('will not partially match hosts with only one in no_proxy list', () => {
    const matched = NoProxyParseAndMatch('http://foo/', 'foo.bar');
    assert.equal(matched, false);
  });

  it('will check if no_proxy (*foo.com) matches foo.com', () => {
    const matched = NoProxyParseAndMatch('http://foo.com/', '*foo.com');
    assert.equal(matched, true);
  });

  it('will check if no_proxy (....foo.com) does not match testing.foo.com', () => {
    const matched = NoProxyParseAndMatch('http://testing.foo.com/', '....foo.com');
    assert.equal(matched, false);
  });

  it('will check if no_proxy (*.foo.com) matches testing.foo.com', () => {
    const matched = NoProxyParseAndMatch('http://testing.foo.com/', '*.foo.com');
    assert.equal(matched, true);
  });

  it('will check if no_proxy matches testing.foo2.com and hostname should not match', () => {
    const matched = NoProxyParseAndMatch('http://testing.foo2.com/', '*.foo.com');
    assert.equal(matched, false);
  });

  it('will check if no_proxy matches testing.foobcom does not match testing.foobcom', () => {
    const matched = NoProxyParseAndMatch('http://testing.foobcom/', '*.foo.com');
    assert.equal(matched, false);

  });

  it('will check if no_proxy = localhost,*.foo.com does not match hostname = testing.bar.com', () => {
    const matched = NoProxyParseAndMatch('http://testing.bar.com/', 'localhost,*.foo.com');
    assert.equal(matched, false);

  });

  it('will check if no_proxy has localhost,*.foo.com matches hostname testing.foo.com', () => {
    const matched = NoProxyParseAndMatch('http://testing.foo.com/', 'localhost,*.foo.com');
    assert.equal(matched, true);

  });

  it('will check if no_proxy has localhost,*.foo.com does not match hostname testing.foobcom', () => {
    const matched = NoProxyParseAndMatch('http://testing.foobcom/', 'localhost,*.foo.com');
    assert.equal(matched, false);

  });


  it('will check if no_proxy has localhost,.foo*.com matches hostname testing.foo.hello.com', () => {
    const matched = NoProxyParseAndMatch('http://testing.foo.hello.com/', 'localhost,.foo*.com');
    assert.equal(matched, true);

  });

  it('will check if no_proxy has localhost,foo*.com and hostname testing-foo.hello.com', () => {
    const matched = NoProxyParseAndMatch('http://testing-foo.hello.com/', 'localhost,foo*.com');
    assert.equal(matched, true);

  });


  it('will check if no_proxy has foo*.com:4000 does not match hostname testing-foo.hello.com', () => {
    const matched = NoProxyParseAndMatch('http://testing-foo.hello.com/', 'foo*.com:4000');
    assert.equal(matched, false);

  });

  it('will check if no_proxy has foo*.com:4000 matches hostname testing-foo.hello.com:4000', () => {
    const matched = NoProxyParseAndMatch('http://testing-foo.hello.com:4000/', 'foo*.com:4000');
    assert.equal(matched, true);

  });

  it('will check if no_proxy has localhost,checkers.part.com,foo*.com:4000 matches hostname testing-foo.hello.com:4000', () => {
    const matched = NoProxyParseAndMatch('http://testing-foo.hello.com:4000/', 'localhost,checkers.part.com,foo*.com:4000');
    assert.equal(matched, true);

  });

  it('will check if no_proxy has localhost,checkers.part.com,foo*.com matches hostname testing-foo.hello.com:4000', () => {
    const matched = NoProxyParseAndMatch('http://testing-foo.hello.com:4000/', 'localhost,checkers.part.com,foo*.com');
    assert.equal(matched, true);

  });

  it('will check if no_proxy has localhost,checkers.part.com,foo*.com:4000,testing-bar.hello.com matches hostname testing-bar.hello.com', () => {
    const matched = NoProxyParseAndMatch('http://testing-bar.hello.com/', 'localhost,checkers.part.com,foo*.com:4000,testing-bar.hello.com');
    assert.equal(matched, true);

  });
});
