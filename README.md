# node-request-to-curl
Adds a ``.toCurl()`` method to http.ClientRequests to generate output equivalent to the 'Copy as Curl' option in the WebKit
debugger.

## Features
* Based from the WebKit code that Chrome uses in its debugger to generate curl commands
* Hooks into Node.js at a low-level and is compatible with helper libraries (tested with [request](https://github.com/request/request))
* Parses the outgoing request to get what was sent over the wire

## Use in production
All outgoing HTTP requests are parsed using Node's own HTTP library in a manner similar to how an incoming request is
handled. This will incur a minor performance penalty.

## Headers
The code from WebKit removes headers that curl calculates for us (namely ``content-length``).

## How to use

### request
```javascript
var request = require('request');
require('request-to-curl');

request('http://www.google.com', function (error, response, body) {
    console.log(response.request.req.toCurl());
});
```

**Output:**
```shell
curl 'http://www.google.com/' --compressed
```

### http
```javascript
var http = require('http'),
    querystring = require('querystring');

require('request-to-curl');

var postData = querystring.stringify({
    'msg': 'Hello World!'
});

var options = {
    hostname: 'www.google.com',
    port: 80,
    path: '/upload',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
    }
};

var req = http.request(options, (res) => {
    console.log(req.toCurl());
});

req.on('error', (e) => {
    console.log(`problem with request: ${e.message}`);
});

// write data to request body
req.write(postData);
req.end();

```

**Output:**
```shell
curl 'http://www.google.com/upload' -H 'content-type: application/x-www-form-urlencoded' --data 'msg=Hello%20World!' --compressed
```