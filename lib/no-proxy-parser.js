'use strict';

const url = require('url')

function canonicalizeHostname(h) {
    return h.replace(/^\.*/, '.').toLowerCase();
}

function parseNoProxy(noProxyVar) {
  var hosts = noProxyVar.split(',');

  var formattedHosts = hosts.map((h) => {
    var hostParts = h.split(':');
    return {
      host: canonicalizeHostname(hostParts[0]),
      port: hostParts[1]
    }
  });
  return formattedHosts;
}

/*
Check if the hostname port matches the no_proxy hostname/port.
Return true ONLY IF
1) NO_PROXY port is not included AND the hostname matches the no_proxy hostname.
2) if NO_PROXY port is included then it matches the hostname port and the hostnames match.
otherwise return false

i.e.
foo.com:4000 matches no_proxy: foo.com
foo.com:4000 matches no_proxy: foo.com:4000
foo.com:4000 does not match no_proxy: foo.com:3000
foo.bar.com:4000 matches no_proxy: foo*.com
foo.bar.com:4000 matches no_proxy: foo*.com:4000
foo.bar.com:4000 does not match no_proxy: foo*.com:3000
*/
function doesPortMatch(hostPort, noproxyPort, hostnamesMatch){
  if(noproxyPort) {
    return (hostPort === noproxyPort) && hostnamesMatch;
  } else {
    return hostnamesMatch;
  }
}

function matchHostAgainstNoProxy(host, noProxyVar) {
  if(!host || !noProxyVar) {
    return false;
  }
  var parsedHosts = parseNoProxy(noProxyVar);
  var parsedHostToMatch = url.parse(host);
  var canonicalHost = canonicalizeHostname(parsedHostToMatch.hostname);

  if(!parsedHostToMatch.port) {
    parsedHostToMatch.port = ((parsedHostToMatch.protocol === 'https:') ? '443' : '80');
  }

  return parsedHosts.some((e) => {
    if(e.host.indexOf('*') !== -1 ){
      //drop the first period that is added by canonicalizeHostname function
      var hostname = e.host.replace(/./,'');
      //replace all . with \. ensures the regex pattern looks for the acutal period
      var escapedPattern = hostname.replace(/\./g,'\\.');
      escapedPattern = escapedPattern.replace('*','.*');
      var pattern = new RegExp(escapedPattern);
      var match = pattern.test(canonicalHost);
      return doesPortMatch(parsedHostToMatch.port, e.port, match);
    } else {
      var matchIndex = e.host.indexOf(canonicalHost);
      const match = matchIndex > -1

      var perfectHostMatch = match && (matchIndex === (e.host.length - canonicalHost.length));
      return doesPortMatch(parsedHostToMatch.port, e.port, perfectHostMatch);
    }
});
}

module.exports = matchHostAgainstNoProxy;
