'use strict';

var os = require('os'),
    http = require('http'),
    url = require('url'),
    HTTPParser = require('http-parser-js').HTTPParser;

/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

function parseRequestBody(request) {
    var parser = new HTTPParser(HTTPParser.REQUEST);

    parser.body = '';
    parser.bodyStart = 0;

    parser[HTTPParser.kOnBody | 0] = function (b, start) {
        if (!parser.bodyStart) {
            parser.bodyStart = start;
        }

        parser.body = b;
    };

    if (typeof request === 'string') {
        request = Buffer.from(request);
    }

    parser.execute(request, 0, request.length);

    return parser.body.slice(parser.bodyStart);
}

function escapeStringWindows(str) {
    return "\"" + str.replace(/"/g, "\"\"")
                     .replace(/%/g, "\"%\"")
                     .replace(/\\/g, "\\\\")
                     .replace(/[\r\n]+/g, "\"^$&\"") + "\"";
}

function escapeStringPosix(str) {
    function escapeCharacter(x) {
        var code = x.charCodeAt(0);
        if (code < 256) {
            // Add leading zero when needed to not care about the next character.
            return code < 16 ? "\\x0" + code.toString(16) : "\\x" + code.toString(16);
        }
        code = code.toString(16);
        return "\\u" + ("0000" + code).substr(code.length, 4);
    }

    if (/[^\x20-\x7E]|\'/.test(str)) {
        // Use ANSI-C quoting syntax.
        return "$\'" + str.replace(/\\/g, "\\\\")
                          .replace(/\'/g, "\\\'")
                          .replace(/\n/g, "\\n")
                          .replace(/\r/g, "\\r")
                          .replace(/[^\x20-\x7E]/g, escapeCharacter) + "'";
    } else {
        // Use single quote syntax.
        return "'" + str + "'";
    }
}

function toCurl(platform) {
    platform = platform || (os.platform().startsWith('win') ? 'win' : 'posix');

    var command = ['curl'],
        ignoredHeaders = ['host', 'method', 'path', 'scheme', 'version'],
        escapeString = platform === 'win' ? escapeStringWindows : escapeStringPosix,
        requestMethod = 'GET',
        data = [],
        requestHeaders = (typeof this.getHeaders === 'function') ? this.getHeaders() : this._headers,
        requestBody = parseRequestBody(this._requestBody).toString(),
        contentType = requestHeaders['content-type'];

    command.push(escapeString(url.format({
            protocol: this.agent.protocol,
            port: this.agent.port,
            host: requestHeaders.host
        }) + this.path).replace(/[[{}\]]/g, "\\$&")
    );

    if (requestBody !== '') {
        ignoredHeaders.push('content-length');
        requestMethod = 'POST';

        if (contentType && contentType.startsWith('application/x-www-form-urlencoded')) {
            data.push('--data');
        } else {
            data.push('--data-binary');
        }

        data.push(escapeString(requestBody));
    }

    if (this.method !== requestMethod) {
        command.push('-X');
        command.push(this.method);
    }

    Object.keys(requestHeaders)
          .filter(name => ignoredHeaders.indexOf(name) === -1)
          .forEach(function (name) {
               command.push('-H');
               command.push(escapeString(name.replace(/^:/, '') + ': ' + requestHeaders[name]));
           });

    command = command.concat(data);
    command.push('--compressed');

    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED == '0') {
        command.push('--insecure');
    }

    return command.join(' ');
}

const originalOnSocket = http.ClientRequest.prototype.onSocket;

function onSocket(socket) {
    var self = this,
        ondata = socket.ondata,
        write = socket.write;

    self._requestBody = '';

    socket.ondata = function (buf, start, end) {
        self._requestBody += buf.slice(start, end).toString();
        return ondata.apply(this, arguments);
    };

    socket.write = function (data) {
        self._requestBody += data.toString()
        return write.apply(this, arguments);
    };

    socket.once('close', function () {
        self.body = parseRequestBody(self._requestBody);
    });

    originalOnSocket.call(this, socket);
};

if(!http.ClientRequest.prototype.toCurl) {
  http.ClientRequest.prototype.onSocket = onSocket;
  http.ClientRequest.prototype.toCurl = toCurl;
}
