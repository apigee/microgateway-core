'use strict';

const stats = {
  treqErrors: 0,
  tresErrors: 0,
  statusCodes: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  },
  requests: 0,
  responses: 0
};

Object.defineProperty(stats, 'connections', {
  enumerable: true,
  get: function() { return global.connections; }
});

module.exports.getStats = function() {
  return stats;
};

module.exports.incrementRequestCount = function() {
  stats.requests++;
};

module.exports.incrementResponseCount = function() {
  stats.responses++;
};

module.exports.incrementRequestErrorCount = function() {
  stats.treqErrors++;
};

module.exports.incrementResponseErrorCount = function() {
  stats.tresErrors++;
};

module.exports.incrementStatusCount = function(code) {
  const bucket = code / 100;
  if (bucket > 0 && bucket < 6) {
    stats.statusCodes[bucket.toFixed()]++;
  }
};
