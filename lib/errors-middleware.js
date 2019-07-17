'use strict';

const debug = require('debug')('gateway:errors');
const stats = require('./stats');
const logging = require('./logging');
const _ = require('lodash');

module.exports = function error() {

  const logger = logging.getLogger();

  return function handleErrors(err, req, res,component) {

    if(!err){
      return;
    }

    if(_.isBoolean(err)){
      return;
    }

    if ( err instanceof Error) {
      // ensure message is serialized
      Object.defineProperty(err, 'message', { enumerable: true });
    }

    debug(err);
    logger.eventLog({level:'error', req: req, res: res, err: err,component:component });

    // update stats
    stats.incrementRequestErrorCount();
    if (_.isNumber( err.status )) {
      stats.incrementStatusCount(err.status);
    }

    if (!res.statusCode) {
      res.statusCode = 500; // default to Internal Error if not set
    } else {
      // should not be returning OK in case of errors
      var bucket = res.statusCode / 100;
      if (bucket > 1 && bucket < 3) res.statusCode = 500;
    }

    res.end(JSON.stringify(err));
  }
};
