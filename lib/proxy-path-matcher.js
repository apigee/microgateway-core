const minimatch = require('minimatch');
const util = require('util');

const matchPath = (requestPath, proxyPath) => {
  var pathRegex = generateMatchingRegex(proxyPath);
  return pathRegex.test(requestPath);
}

const getProxyFromBasePath = (proxies, pathname) => {
  var longest = 0;
  var match = undefined;

  proxies.forEach((p) => {
    if(matchPath(pathname, p.base_path)) {
      if(p.base_path.length > longest) {
        match = p;
        longest = p.base_path.length; 
      }
    }
  });

  return match;
}
const generatedRegexCache = {};

const generateMatchingRegex = (proxyPath) => {
  if(generatedRegexCache[proxyPath]) {
    return generatedRegexCache[proxyPath];
  }
  const matchRegex = minimatch.makeRe(proxyPath);
  //minimatch creates a regex that will hard match the path. 
  //we remove the end of input so it can match proxy path and extras
  const cleansedRegex = matchRegex.toString().replace('$', '').slice(1, -1);
  return generatedRegexCache[proxyPath] = new RegExp(cleansedRegex);
}

module.exports.matchPath = matchPath;
module.exports.generateMatchingRegex = generateMatchingRegex;
module.exports.getProxyFromBasePath = getProxyFromBasePath;
