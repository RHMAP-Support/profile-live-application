var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var crypto = require('crypto');

function helloRoute() {
  var hello = new express.Router();
  hello.use(cors());
  hello.use(bodyParser());


  // GET REST endpoint - query params may or may not be populated
  hello.get('/', function(req, res) {
    console.log(new Date(), 'In hello route GET / req.query=', req.query);
    var world = req.query && req.query.hello ? req.query.hello : 'World';

    const secret = 'abcdefg';
    let hash = '';
    for(let i = 0; i < 1000; i++){
      hash += crypto.createHmac('sha256', secret).update('I love cupcakes').digest('hex');
    }

    // see http://expressjs.com/4x/api.html#res.json
    res.json({msg: 'Hello ' + world, hash});
  });

  // POST REST endpoint - note we use 'body-parser' middleware above to parse the request body in this route.
  // This can also be added in application.js
  // See: https://github.com/senchalabs/connect#middleware for a list of Express 4 middleware
  hello.post('/', function(req, res) {
    console.log(new Date(), 'In hello route POST / req.body=', req.body);
    var world = req.body && req.body.hello ? req.body.hello : 'World';

    const secret = 'abcdefg';
    const hash = '';
    for(let i = 0; i < 1000; i++){
      hash += crypto.createHmac('sha256', secret).update('I love cupcakes').digest('hex');
    }

    // see http://expressjs.com/4x/api.html#res.json
    res.json({msg: 'Hello ' + world, hash});
  });

  return hello;
}

module.exports = helloRoute;
