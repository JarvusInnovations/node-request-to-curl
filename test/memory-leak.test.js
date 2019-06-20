require('../index.js');

/* This module is currently compatible with any version of node...
   so we're kicking it old school :D
*/

var http = require('http');
var assert = require('assert');
var request = require('request');
var Bluebird = require('bluebird');

describe('usage with request module and bluebird', function () {
  var server = http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pr pr pr pr pr pr pr pr pr pr pr propaganda');
  }),
    listenPort,
    beforeMemoryUsage;

  before(function (done) {
    server.listen(0, function (err) {
      if (err) throw err;
      listenPort = server.address().port;
      beforeMemoryUsage = process.memoryUsage();
      done();
    })
  })

  after(function (done) {
    server.close(function () {
      done();
    });
  })

  describe('should not leak memory [this will take a few minutes to run]', function () {
    it('should not leak memory after each request (ISSUE #1)', function (done) {
      this.timeout(5 * 60 * 1000);

      Bluebird
        .mapSeries(new Array(50000), function () {
          return new Bluebird(function (resolve) {
            return request('http://localhost:' + listenPort, function (err, response) {
              if (err) throw err;
              response.request.req.toCurl();
              resolve();
            });
          });
        })
        .then(function () {
          global.gc();
          var diffRss = (process.memoryUsage().rss - beforeMemoryUsage.rss) / 1024 / 1024;
          console.log(diffRss);
          assert(diffRss <= 32 /* yay, magic numbers */);
          done();
        })
        .catch(function (e) {
          throw e;
        });
    });
  });
});