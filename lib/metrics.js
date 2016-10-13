var Client = require('stats-client');

module.exports.client = function(port) {
    return new Client(`localhost:${port}`);
}