
'use strict';

const fs = require('fs');
const mkdir = require('mkdirp');
const os = require('os');
const path = require('path');
const util = require('util');
const configService = require('./config')
const stats = require('./stats')
const assert = require('assert')
const uuid = require('uuid')
const cluster = require('cluster')

var logger = null;
var logToConsole = false;
module.exports.init = function init(stubConfig) {

  const config = stubConfig || configService.get()
  assert(config, 'must have config')
  assert(config.uid, 'config must have uid');
  const uid = config.uid || uuid.v1();

  const logConfig = config.edgemicro.logging;
  assert(logConfig, 'must have config.edgemicro.logging in config');
  logToConsole = !!logConfig.to_console;

  var rotation = 0;
  const logDir = logConfig.dir || process.cwd();
  var logFilePath = _calculateLogFilePath(logDir, uid, rotation);

  mkdir.sync(logDir);

  statsTimer(logConfig.stats_log_interval);

  // using a WriteStream here causes excessive memory growth under high load (with node v0.12.6, jul 2015)
  var logFileFd;
  var logFailWarn = false;
  var writeInProgress = false;
  var records = [];
  var offset = 0;
  var nextRotation = 0;


  // buffer the write if a write is already in progress
  // https://nodejs.org/api/fs.html#fs_fs_write_fd_data_position_encoding_callback
  // "Note that it is unsafe to use fs.write multiple times on the same file without waiting for the callback."
  const writeLogRecordToFile = function (record,cb) {
    if (Date.now() > nextRotation) {
      rotation++;
     if (logFileFd) {
        fs.close(logFileFd);
      }
      logFilePath = _calculateLogFilePath(logDir, uid, rotation);
      if (cluster.isMaster) {
        if(!logToConsole) {
          console.log('logging to ' + logFilePath);
        }
      }
   
      logFileFd = fs.openSync(logFilePath, 'a', 0o0600);
      nextRotation = Date.now() + ((logConfig.rotate_interval || 24) * 60 * 60 * 1000); // hours -> ms
    }

    if ( record ) records.push(record);
    if ( writeInProgress || (records.length === 0) ) {
      return record;
    }
    

    writeInProgress = true;
    const buffer = records.join('');
    records = [];

    fs.write(logFileFd, buffer, offset, 'utf8', function (err, written) {
      writeInProgress = false;

      if (err) {
        if (!logFailWarn) {
          // print warning once, dumping every failure to console would overwhelm the console
          console.warn('error writing log', err);
          logFailWarn = true;
        }
      } else {
        offset += written;
      }

      if (records.length > 0) {
        process.nextTick(function () {
          writeLogRecordToFile();
        });
      } else {
          if ( cb !== undefined ) {
              try {
                cb();
              } catch (e) {
                  console.log(e);
              }
          }
      }
    });
    return buffer;
  }

  const writeLogRecordToConsole = (record,cb) => {
    if(record) {
      if(record.startsWith('error') || record.startsWith('warn')) {
        console.error(record);
      } else {
          process.stdout.write(record);
          if ( cb !== undefined ) {
              try {
                cb();
              } catch (e) {
                  console.log(e);
              }
          }
      }
    }
  }

  const writeLog = function (level, obj, msg) {
    if (!cluster.isMaster) {
      const rec = serializeLogRecord(level, logConfig.level, obj, msg);
      if (process.connected) {
        process.send({level:level, msg: rec});
      }
       return rec;
    }
    return logger.writeLogRecord(serializeLogRecord(level, logConfig.level, obj, msg));
  }
  logger = {
    info: function (obj, msg) {
      return writeLog('info', obj, msg);
    },
    warn: function (obj, msg) {
      return writeLog('warn', obj, msg);
    },
    error: function (obj, msg) {
      return writeLog('error', obj, msg);
    },
    stats: function (statsInfo, msg) {
      return writeLog('stats', { stats: statsInfo }, msg);
    },
    setLevel: function (level) {
      logConfig.level = level;
    },
    writeLogRecord: function(record,cb) {              
      const writeRecordToOutput = logToConsole ? writeLogRecordToConsole : writeLogRecordToFile;
      if ( record && record.msg ) writeRecordToOutput(record.msg,cb);
      return record;
    }
  };


  if (cluster.isMaster) {
    if(logToConsole) {
      console.log('logging to console');
    } 

    Object.keys(cluster.workers).forEach((id) => {
      cluster.workers[id].on('message', function (msg) {
        if ( msg && msg.msg ) logger.writeLogRecord(msg.msg);
      });
    });
  }


  return logger;
}
module.exports.getLogger = function () {
  return logger;
}
// choose certain properties of req/res/err to include in log records, pass the rest through
// be extra careful to not throw an error here
// - by inadvertently dereferencing any null/undefined objects
function serializeLogRecord(level, configLevel, obj, text) {
  if (configLevel === 'none') {
    return null;
  }
  switch (level) {
    case 'info': {
      if (configLevel === 'warn' || configLevel === 'error') {
        return null;
      }
      break;
    }
    case 'warn': {
      if ( configLevel === 'error' ) {
        return null;
      }
      break;
    }
  }

  const record = {};
  if (typeof obj === 'string') {
    if (text) text = text + ' ' + obj; // append obj to text
    else text = obj; // assign obj to text
  } else if (obj) Object.keys(obj).forEach(function (key) {
    if (key === 'req') {
      const req = obj[key];
      if (req) {
        record.m = req.method;
        record.u = req.url;
        record.h = (req.headers ? req.headers.host : '');
        record.r = (req.socket ? (req.socket.remoteAddress + ':' + req.socket.remotePort) : ':0');
      }
    } else if (key === 'res') {
      const res = obj[key];
      if (res) {
        record.s = res.statusCode
      }
    } else if (key === 'err') {
      const err = obj[key];
      if (err) {
        record.name = err.name;
        record.message = err.message;
        record.code = err.code;
        record.stack = err.stack;
      }
    } else if (key === 'stats') {
      const stats = obj[key];
      if (stats) {
        Object.keys(stats).forEach(function (key) {
          if (key === 'statusCodes') {
            const codes = stats[key];
            record[key] = '{' + Object.keys(codes).map(function (code) {
              return code + '=' + codes[code];
            }).join(', ') + '}'
          } else {
            record[key] = stats[key];
          }
        });
      }

      const mem = process.memoryUsage();
      record.rss = mem.rss;

      const cpus = os.cpus();
      const userTimes = [];
      cpus.forEach(function (cpu) {
        userTimes.push(cpu.times.user);
      });
      record.cpu = '[' + userTimes.join(', ') + ']';
    } else {
      record[key] = obj[key];
    }
  });

  const preamble = Date.now() + ' '

  var message =preamble +
    level + ' ' +
    (text ? text + ' ' : '') +
    Object.keys(record).map(function (key) {
      return key + '=' + record[key]; // assumes vaules are primitive, no recursion
    }).join(', ') +
    os.EOL;

  return message;

}

function statsTimer(statsLogInterval) {
  // periodically log stats, but not if idle (no new requests or responses)

  if (typeof statsLogInterval === 'number' && statsLogInterval > 0) {
    var lastRequests = 0;
    var lastResponses = 0;
    const logTimer = setInterval(function () {
      const statsInfo = stats.getStats();
      if (lastRequests !== statsInfo.requests && lastResponses !== statsInfo.responses) {
        lastRequests = statsInfo.requests;
        lastResponses = statsInfo.responses;
        logger.stats(statsInfo);
      }
    }, statsLogInterval * 1000); // convert seconds to milliseconds
    logTimer.unref(); // don't keep event loop alive just for logging stats
  }
}

const _calculateLogFilePath = (logDir, uid, rotation) => {
  const baseFileName = util.format('edgemicro-%s-%s-%d-api.log', os.hostname(), uid, rotation);
  const logFilePath = path.join(logDir, baseFileName);
  return logFilePath;
};

module.exports._calculateLogFilePath = _calculateLogFilePath;
