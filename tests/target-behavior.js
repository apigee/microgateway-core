const assert = require('assert');
const rewire = require('rewire');
const PluginsMiddleware = rewire('../lib/plugins-middleware');
const {spawn} = require('child_process')


var mockLogger = {
    info: function (obj, msg) {
    },
    warn: function (obj, msg) {
    },
    error: function (obj, msg) {
    },
    eventLog: function (obj, msg) {
    },
    consoleLog: function (level, ...data) {
    },
    stats: function (statsInfo, msg) {
    },
    setLevel: function (level) {
    },
    writeLogRecord: function(record,cb) {              
    }
  };

function launchFauxServer() {
    //
    var myServer = spawn('node', [__dirname + '/hello_rest/notalker.js'], {
        'stdio' : [ 'pipe', 'pipe', 'pipe', 'ipc' ]
    })

    myServer.on('error', (e) => {
        console.log('little server error: ' + e.message)
    })

    return myServer
}


describe('target behavior', () => {
    //
    it('handles connection refused', (done) => {
        //
        var getTargetRequest = PluginsMiddleware.__get__('getTargetRequest')
        //
        PluginsMiddleware.__set__('logging',{
            getLogger : () => {
                return mockLogger
            }
        })

        //
        var mockConfig = {
            headers : {
                'x-forwarded-for' : "xyz",
                'x-forwarded-id' : "xyz",
                'x-forwarded-proto' : "xyz",
                'via' : "xyz",
                'x-forwarded-host' : "wasit"
            },
            edgemicro : {
                request_timeout : 100
            }
        };

        PluginsMiddleware.__set__('configService', {
            get : () => {
                return mockConfig
            }
        });
        //

        //getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb)

        var sourceRequest = {
            'method' : 'GET',
            'connection' : {
                'encrypted' : false
            },
            'socket' : { 
                remoteAddress : "localhost"
            },
            'headers': {
                'hostname' : 'localhost:7777',
                'transfer-encoding' : 'chunked'
            },
            'targetSecure' : false,
            'targetHostname' : 'localhost',
            'targetPort' : 8888,
            transactionContextData: {
                'targetHostName' : 'localhost'
            }
        }

        var sourceResponse = {
            'proxy' : {
                'agent' : undefined
            },
            'content-length' : 50
        }

        var plugins = []
        var startTime = Date.now()

        var correlation_id = "osirusor"
        var cb = (e) => {
            console.log(e.message)

            console.dir(sourceResponse,{ depth : 2 })
            assert(sourceResponse.statusCode === 502)
            assert("connect ECONNREFUSED 127.0.0.1:8888" === e.message)
            done()
        }

        var treq = getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb)

        treq.end()
    });

    //
    it('handles connection ENOTFOUND', (done) => {
        //
        var getTargetRequest = PluginsMiddleware.__get__('getTargetRequest')
        //
        PluginsMiddleware.__set__('logging',{
            getLogger : () => {
                return mockLogger
            }
        })

        //
        var mockConfig = {
            headers : {
                'x-forwarded-for' : "xyz",
                'x-forwarded-id' : "xyz",
                'x-forwarded-proto' : "xyz",
                'via' : "xyz",
                'x-forwarded-host' : "wasit"
            },
            edgemicro : {
                request_timeout : 100
            }
        };

        PluginsMiddleware.__set__('configService', {
            get : () => {
                return mockConfig
            }
        });
        //

        //getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb)

        var sourceRequest = {
            'method' : 'GET',
            'connection' : {
                'encrypted' : false
            },
            'socket' : { 
                remoteAddress : "this.does.not.exist"
            },
            'headers': {
                'hostname' : 'this.does.not.exist:7777',
                'transfer-encoding' : 'chunked'
            },
            'targetSecure' : false,
            'targetHostname' : 'this.does.not.exist',
            'targetPort' : 8999,
            transactionContextData: {
                'targetHostName' : 'this.does.not.exist'
            }
        }

        var sourceResponse = {
            'proxy' : {
                'agent' : undefined
            },
            'content-length' : 50
        }

        var plugins = []
        var startTime = Date.now()

        var correlation_id = "osirusor"
        var cb = (e) => {
            console.log(e)
            assert(e.code === 'ENOTFOUND')

            console.dir(sourceResponse,{ depth : 2 })
            console.log(e.message)

            assert(typeof e.message === "string")
            assert(e.message.indexOf("getaddrinfo ENOTFOUND this.does.not.exist") >= 0)
            done()
        }

        var treq = getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb)

        treq.end()
    });

    //
    it('handles connection TIMEMOUT', (done) => {
        //
        var noTalker = launchFauxServer()

        noTalker.on('message',(msg) => {
            console.log(msg)
            var getTargetRequest = PluginsMiddleware.__get__('getTargetRequest')
            //
            PluginsMiddleware.__set__('logging',{
                getLogger : () => {
                    return mockLogger
                }
            })
            //
            var mockConfig = {
                headers : {
                    'x-forwarded-for' : "xyz",
                    'x-forwarded-id' : "xyz",
                    'x-forwarded-proto' : "xyz",
                    'via' : "xyz",
                    'x-forwarded-host' : "wasit"
                },
                edgemicro : {
                    request_timeout : (1/2)
                }
            };

            PluginsMiddleware.__set__('configService', {
                get : () => {
                    return mockConfig
                }
            });
            //

            //getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb)

            var sourceRequest = {
                'method' : 'GET',
                'connection' : {
                    'encrypted' : false
                },
                'socket' : { 
                    remoteAddress : "this.does.not.exist"
                },
                'headers': {
                    'hostname' : 'localhost:8999',
                    'transfer-encoding' : 'chunked'
                },
                'targetSecure' : false,
                'targetHostname' : 'localhost',
                'targetPort' : 8999,
                transactionContextData: {
                    'targetHostName' : 'this.does.not.exist'
                }
            }

            var sourceResponse = {
                'proxy' : {
                    'agent' : undefined
                },
                'content-length' : 50
            }

            var plugins = []
            var startTime = Date.now()

            var correlation_id = "osirusor"
            var cb = (e) => {
                assert("Gateway timed out trying to reach target"  === e.message)
                assert(sourceResponse.statusCode === 504)

                noTalker.kill()
                //
                assert(true)
                done()
            }

            var treq = getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb)

            treq.end()
        })

    });

});
