var restify = require('restify');


module.exports = function (bodyMap) {

  function respond(req, res, next) {
    console.log('request received');
    var key = req.params.key;
    var value = bodyMap[req.params.key];
    var returnVal = {};
    returnVal[key] = value  || "unknown";
    if(req.body){
      returnVal.body = req.body;
    }
    res.json(200, returnVal, {});
    next();
  }

  var server = restify.createServer({});
    
  server.use(restify.plugins.bodyParser());
  server.use(restify.plugins.gzipResponse());


  server.get('/echo/:key', respond);
  //server.delete('/echo/:key', respond);


  server.post({
    path: '/echo/:key'
  }, respond);
  server.put({
    path: '/echo/:key'
  }, respond);

  server.del({
    path: '/echo/:key'
  }, respond);

  return server;

};