'use strict';
var _ = require('lodash');

const TestPlugin = function (cb) {
  this.cb = cb;
  this.expectedHeaders = [];
};

module.exports = function (cb) {
  return new TestPlugin(cb);
};

TestPlugin.prototype.init = function myPlugin1() {
  var cb = this.cb;
  var headers = this.expectedHeaders;

  /**
   'onrequest', 'onresponse', 'onclose_request', 'onclose_response'
   'ondata_request', 'ondata_response', 'onend_request', 'onend_response',
   'onerror_request', 'onerror_response',
   */

  return {
    onrequest: function (req, res, data, next) {
      cb('onrequest', data, function () {
        res.setHeader("x-onrequest-visited", 'true');
        headers.push("x-onrequest-visited");
        next.apply();
      }, req, res);
    },

    onresponse: function (req, res, data, next) {
      cb('onresponse', data, function () {
        res.setHeader("x-onresponse-visited", 'true');
        headers.push("x-onresponse-visited");
        next(null, data);
      }, req, res);
    },
    ondata_request: function (req, res, data, next) {
      cb('ondata_request', data, function () {
        next(null, data);
      }, req, res);
    },
    ondata_response: function (req, res, data, next) {
      cb('ondata_response', data, function () {
        next(null, data);
      }, req, res);
    },
    onend_request: function (req, res, data, next) {
      cb('onend_request', data, function () {
        next(null, data);
      }, req, res);
    },
    onend_response: function (req, res, data, next) {
      cb('onend_response', data, function () {
        next(null, data);
      }, req, res);
    },
    onerror_request: function (req, res, data, next) {
      cb('onerror_request', data, function () {
        next();
      }, req, res);
    },
    onerror_response: function (req, res, data, next) {
      cb('onerror_response', data, function () {
        res.setHeader("x-onerror_response-visited", 'true');
        headers.push("x-onerror_response-visited");
        next();
      }, req, res);
    }
  };


};
