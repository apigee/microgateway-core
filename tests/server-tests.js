'use strict'

var assert = require('assert');
var gatewayLib = require('../index');
var async = require('async')


describe('server startup', function () {


  // it('should start and i can run 4 of these', function (done) {
  //   async.parallel(
  //     {
  //       one:function(cb){
  //         var gateway = gatewayLib(getConfig(8884));
  //         gateway.start( function (err, server) {
  //           err && console.log(err)
  //           assert(!err, err)
  //           assert(server, 'ga')
  //           cb(null,gateway);

  //         })
  //       },
  //       two:function(cb){
  //         var gateway = gatewayLib(getConfig(9888));
  //         gateway.start( function (err, server) {
  //           err && console.log(err)
  //           assert(!err, err)
  //           assert(server, 'ga')
  //           cb(null,gateway);

  //         })
  //       },
  //       three:function(cb){
  //         var gateway = gatewayLib(getConfig(8887));
  //         gateway.start( function (err, server) {
  //           err && console.log(err)
  //           assert(!err, err)
  //           assert(server, 'ga')
  //           cb(null,gateway);
  //         })
  //       },
  //       four:function(cb){
  //         var gateway = gatewayLib(getConfig(8886));
  //         gateway.start( function (err, server) {
  //           err && console.log(err)
  //           assert(!err, err)
  //           assert(server, 'ga')
  //           cb(null,gateway);
  //         })
  //       }
  //     },
  //     function(err,res){
  //       assert(!err,err);
  //       Object.keys(res).forEach((r)=>{
  //         res[r].stop();
  //       });
  //       done();
  //     }
  //   )

  // });

//   it('should start and i cant run 2 on the same port', function (done) {
//     async.parallel(
//       {
//         one: function (cb) {
//           var gateway = gatewayLib(getConfig(8884));
//           gateway.start(function (err, server) {
//             err && console.log(err)
//             assert(err, 'should find err')
//             assert(!server, 'ga')
//             cb(null, gateway);

//           })
//         },
//         two: function (cb) {
//           var gateway = gatewayLib(getConfig(8884));
//           gateway.start(function (err, server) {
//             err && console.log(err)
//             assert(err, 'should find err')

//             assert(!server, 'ga')
//             cb(null, gateway);

//           })
//         }
//       }
//       ,
//       function(err,res){
//         assert(!err,err);
//         Object.keys(res).forEach((r)=>{
//           res[r].stop();
//         });
//         done();
//       }
//     )

//   });
});

function getConfig(gatewayPort){
  var port = 80;
  var config = {
    edgemicro: {
      port: gatewayPort,
      logging: {level: 'info',dir:'./tests/log'}

    },
    proxies: [
      {base_path: '/v1', secure: false, url: 'http://localhost:' + port}
    ]
  };
  return config;
}