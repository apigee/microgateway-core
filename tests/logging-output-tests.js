'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const util = require('util');
const os = require('os');
var chai = require('chai');
var expect = chai.expect;
var until = require('test-until');
var debug = require('debug')('gateway:logging-test');


function cleanFiles() {
    //List all files in the test logs and get rid of em.
    const logDirPath = './tests/log';
    var files = fs.readdirSync('./tests/log');
    files.forEach((f) => {
      fs.unlinkSync(path.join(logDirPath, f));
    });
}

describe('logging', function() {
  process.env.NODE_ENV = 'test';
  var config = {
    uid: '1',
    edgemicro: {
      port: 8000,
      logging: {
        level: 'info',
        dir: './tests/log',
        rotate_interval: 24
      }
    }
  };
    
  var logging;
  var log;
    
  beforeEach(function(done) {
    logging = require('../lib/logging');
    logging.init(config);
    log = logging.getLogger();
    //done();
    setTimeout(function(){
      done();
    }, 100);
  });

      
  it('exposes a _calculateLogFilePath function', () => {
    assert.ok(logging._calculateLogFilePath);
  });

  it('will calculate a file path for a log in a consistent way', () => {
    var filePath = logging._calculateLogFilePath('./tests/log', '1', 1);
    assert.equal(filePath, path.join('./tests/log', util.format('edgemicro-%s-%s-%d-api.log', os.hostname(), '1', 1)));
  });


  it('will log to a file', () => {
    //
    var whereToFindLog = logging._calculateLogFilePath('./tests/log', '1', 1);
    //
    var nextTest = false;
    var promise = until(() => { return nextTest; })
    //
    var watcher = fs.watch('./tests/log', { encoding: 'buffer' }, (eventType, filename) => {
      if (filename) {
          var fname = filename.toString();
          //
          if ( (eventType == 'change') && ( ('tests/log/' + fname ) == whereToFindLog ) ) {
              //
              
              var content = fs.readFileSync(whereToFindLog);
              var cstr = content.toString();
              //
              assert.equal(cstr, 'foo');
              nextTest = true;
          }
      }
    });

    log.writeLogRecord({ level: 'info', msg: 'foo' }, () => {
    });
      
    promise.then(()=>{
        watcher.close();
        cleanFiles();
    })
      
  });


  it('will log multiple messages to file', () => {
      
    var whereToFindLog = logging._calculateLogFilePath('./tests/log', '1', 1);
    var nextTest = false;
    var promise = until(() => { return nextTest; })
    var watcher = null;
    log.writeLogRecord({ level: 'info', msg: 'foo1' }, () => {
        
          watcher = fs.watch('./tests/log', { encoding: 'buffer' }, (eventType, filename) => {
          if (filename) {
              var fname = filename.toString();
              console.log(eventType + ' :: ' + fname);

              if ( (eventType == 'change') && ( ('tests/log/' + fname ) === whereToFindLog ) ) {
                  watcher.close();
                  var cstr = ""
                  try {
                      var content = fs.readFileSync(whereToFindLog);
                      cstr = content.toString();
                  } catch(e) {
                  }
                  
                  assert.equal(cstr, 'foo1foo2');
                  
                  nextTest = true;
                  
              }

          }
        });

        log.writeLogRecord({ level: 'info', msg: 'foo2' });
        //
        
    });
      //
    promise.then(()=>{
        if ( watcher) watcher.close();
        cleanFiles();
    })
      
  });

    
  //setTimeout(cleanFiles,5000);

});
