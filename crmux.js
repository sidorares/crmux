#!/usr/bin/env node

var http = require('http');
var bl = require('bl');
var url = require('url');
var WebSocket = require('ws');

var colors = require('colors');
var program = require('commander');

program
  .version(require('./package.json').version)
  .option('-p, --port <port>', 'developer tools port [9222]', Number, 9222)
  .option('-l, --listen <port>', 'listen port [9223]', Number, 9223)
  .option('-d, --debug', 'show requests and responses')
  .parse(process.argv);

var lastId = 0;
var upstreamMap = {};



var cachedWsUrls = {};

var cacheJson = function(res) {
  return http.request({
    port: program.port,
    path: '/json'
  }, function(upRes) {
    upRes.pipe(bl(function(err, data) {
      var tabs = JSON.parse(data.toString());
      var wsUrl, urlParsed;
      for (var i = 0; i < tabs.length; ++i) {
        wsUrl = tabs[i].webSocketDebuggerUrl;

        if (typeof wsUrl == 'undefined') {
          wsUrl = cachedWsUrls[tabs[i].id];
        }
        if (typeof wsUrl == 'undefined')
          continue;

        urlParsed = url.parse(wsUrl, true);
        urlParsed.port = program.listen;
        delete urlParsed.host;
        tabs[i].webSocketDebuggerUrl = url.format(urlParsed);
        if (tabs[i].devtoolsFrontendUrl)
          tabs[i].devtoolsFrontendUrl = tabs[i].devtoolsFrontendUrl.replace(wsUrl.slice(5), tabs[i].webSocketDebuggerUrl.slice(5));
        // console.log(tabs[i].devtoolsFrontendUrl, wsUrl, tabs[i].webSocketDebuggerUrl);
        // TODO: cache devtoolsFrontendUrl as well
        cachedWsUrls[tabs[i].id] = wsUrl;
      }
      if (res) {
        res.end(JSON.stringify(tabs));
      }
    }));
  });
}
var server = http.createServer(function(req, res) {
  if (req.url == '/json') {
    cacheJson(res).end();
  } else {
    var options = {};
    options.port = program.port;
    options.path = req.url;
    http.request(options, function(upRes) {
      upRes.pipe(res);
    }).end();
  }
});

server.listen(program.listen);

var wss = new WebSocket.Server({server: server});
wss.on('connection', function(ws) {
    var jsonReq = cacheJson();
    jsonReq.end();

    jsonReq.on('close', function() {
      if (program.debug) {
        console.log('cachedWsUrls:', cachedWsUrls);
      }
    });

    ws._id = lastId++;

    var urlParsed = url.parse(ws.upgradeReq.url, true);
    urlParsed.protocol = 'ws:';
    urlParsed.slashes = '//';
    urlParsed.hostname = 'localhost';
    var wsUpstreamUrlPort = program.port;
    urlParsed.port = wsUpstreamUrlPort;
    delete urlParsed.query;
    delete urlParsed.search;
    delete urlParsed.host;
    var wsUpstreamUrl = url.format(urlParsed);
    var upstreamSocket;
    if (!upstreamMap[wsUpstreamUrl]) {
      upstreamSocket = new WebSocket(wsUpstreamUrl);
      upstreamMap[wsUpstreamUrl] = {
        localId: 0,
        socket: upstreamSocket,
        clients: [ws],
        localIdToRemote: {}
      };
      upstreamSocket.on('message', function(message) {
         var msgObj = JSON.parse(message);
         if (!msgObj.id) { // this is an event, broadcast it
           upstreamMap[wsUpstreamUrl].clients.forEach(function(s) {
             if (program.debug)
               console.log('e> ' + message.cyan);
             s.send(message, function(err) {});
           });
         } else {
           var idMap = upstreamMap[wsUpstreamUrl].localIdToRemote[msgObj.id];
           delete upstreamMap[wsUpstreamUrl].localIdToRemote[msgObj.id];
           msgObj.id = idMap.id;
           idMap.client.send(JSON.stringify(msgObj));
           if (program.debug) {
             console.log(String(idMap.client._id).blue + "> " + idMap.message.yellow);
             console.log(String(idMap.client._id).blue + "> " + JSON.stringify(msgObj).green);
           }
         }
      });
    } else {
      upstreamSocket = upstreamMap[wsUpstreamUrl].socket;
      upstreamMap[wsUpstreamUrl].clients.push(ws);
    }

    ws._upstream = upstreamSocket;
    ws._upstream.params = upstreamMap[wsUpstreamUrl];

    ws.on('message', function(message) {
        var upstream = ws._upstream;

        var msgObj;
        try {
          msgObj = JSON.parse(message);
        } catch(e) {
          console.log(e);
          return;
        }
        upstream.params.localId++;
        var local = upstream.params.localId;
        var remote = msgObj.id;
        msgObj.id = local;
        upstream.params.localIdToRemote[local] = {
          client: ws,
          id: remote,
          message: message
        };
        if (upstream.readyState == 0) {
          upstream.once('open', function() {
            upstream.send(JSON.stringify(msgObj));
          });
        } else
          upstream.send(JSON.stringify(msgObj));
    });

    var removeFromUpstreamMap = function() {
       // TODO:
       // var upstream = ws._upstream;
       // for each key in upstream.params.localIdToRemote
       // delete all keys where ws._id = key.client._id

       var purged = upstreamMap[wsUpstreamUrl].clients.filter(
         function(s) { return s._id != ws._id; }
       );
       upstreamMap[wsUpstreamUrl].clients = purged;
    };
    ws.on('close', removeFromUpstreamMap);
    ws.on('error', removeFromUpstreamMap);
});
