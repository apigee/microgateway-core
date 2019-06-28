'use strict';

const resolve = require('path').resolve;
const debug = require('debug')('trace-helper');
//relative path to the opentracing implementation

if ( process.env.EDGEMICRO_TRACE_MODULE ) {
    var { initTracerMod } = require(resolve(process.env.EDGEMICRO_TRACE_MODULE));
} else {
    var initTracerMod = null;
}

const {
    Tags,
    FORMAT_HTTP_HEADERS
} = require('opentracing');

var targetTrace;
var proxyTrace;
var requestspan;
var responsespan;

module.exports = {
    initTracer: function(name, req, correlation_id) {
        if (process.env.EDGEMICRO_OPENTRACE) {
            try {
                if ( (initTracerMod !== undefined) && initTracerMod ) {
                    proxyTrace = initTracerMod(name);
                    //check if there is a parent id
                    if (checkUberParentId(req.headers)) {
                        debug("opentracing parentid found");
                        requestspan = proxyTrace.extract(FORMAT_HTTP_HEADERS, req.headers);
                    } else {
                        debug("opentracing parentid not found");
                        requestspan = proxyTrace.startSpan("request_start");
                    }
                    requestspan.setTag(Tags.HTTP_URL, req.url);
                    requestspan.setTag(Tags.HTTP_METHOD, req.method);
                    requestspan.setBaggageItem('correlation_id', correlation_id);
                    var traceheaders = {};
                    proxyTrace.inject(requestspan, FORMAT_HTTP_HEADERS, traceheaders);
                    for (var tracekey in traceheaders) {
                        if (!traceheaders.hasOwnProperty(tracekey)) {
                            continue;
                        } else {
                            req.headers[tracekey] = traceheaders[tracekey];
                        }
                    }
                    }
            } catch (err) {}
        }
        return req;
    },
    endRequestSpan: function() {
        if (process.env.EDGEMICRO_OPENTRACE) {
            try {
                requestspan.log({
                    'event': 'request_end'
                });
            } catch (err) {}
        }
    },
    setRequestError: function(obj, msg, stack, statusCode) {
        if (process.env.EDGEMICRO_OPENTRACE) {
            try {
                requestspan.setTag(Tags.ERROR, true);
                requestspan.setTag(Tags.HTTP_STATUS_CODE, statusCode);
                requestspan.log({
                    'event': 'error',
                    'error.object': obj,
                    'message': msg,
                    'stack': stack
                });
                requestspan.finish();
            } catch (err) {}
        }
    },
    setResponseError: function(obj, msg, stack, statusCode) {
        if (process.env.EDGEMICRO_OPENTRACE) {
            try {
                responsespan.setTag(Tags.ERROR, true);
                responsespan.setTag(Tags.HTTP_STATUS_CODE, statusCode);
                responsespan.log({
                    'event': 'error',
                    'error.object': obj,
                    'message': msg,
                    'stack': stack
                });
                responsespan.finish();        
            } catch (err) {}
        }
    },
    endTargetSpan: function(statusCode) {
        if (process.env.EDGEMICRO_OPENTRACE) {
            try {
                responsespan.log({
                    'event': 'target_end'
                });
                responsespan.setTag(Tags.HTTP_STATUS_CODE, statusCode);
                responsespan.finish();
            } catch (err) {}
        }
    },
    startTargetSpan: function(correlation_id, targetHostname) {
        if (process.env.EDGEMICRO_OPENTRACE) {
            try {
                if ( (initTracerMod !== undefined) && initTracerMod ) {
                    targetTrace =  initTracerMod(targetHostname);
                    responsespan = targetTrace.startSpan("target_start", {
                        childOf: requestspan.context()
                    });
                    responsespan.setBaggageItem('correlation_id', correlation_id);
                }  
            } catch (err) {}
        }
    },
    finishRequestSpan: function() {
        if (process.env.EDGEMICRO_OPENTRACE) {
            try {
                requestspan.finish();
            } catch (err) {}
        }
    },
    setChildErrorSpan: function(name, traceheaders) {
        if (process.env.EDGEMICRO_OPENTRACE) {
            try {
                if ( (initTracerMod !== undefined) && initTracerMod ) {
                    var childtracer = initTracerMod(name);
                    var parentSpanContext = childtracer.extract(FORMAT_HTTP_HEADERS, traceheaders);
                    var span = childtracer.startSpan(name + '_error', {
                        childOf: parentSpanContext
                    });
                    span.setTag(Tags.ERROR, true);
                    span.finish();
                }
            } catch (err) {}
        }
    }
}

function checkUberParentId(traceheaders) {
    const uberHeader = 'Uber-Trace-Id';
    return traceheaders.hasOwnProperty(uberHeader.toLowerCase()) ? true : false;
}