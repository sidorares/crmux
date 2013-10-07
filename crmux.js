#!/usr/bin/env node

var http = require('http');
var MULTIPLEX_PORT = 9223;
var DEVTOOLS_PORT = 9222;
var WS_PORT = MULTIPLEX_PORT + 1;
var bl = require('bl');
var url = require('url');
var WebSocket = require('ws');

var colors = require('colors');
var program = require('commander');

var lastId = 0;
var requestId = 0;
var upstreamMap = {};

var wss = new WebSocket.Server({port: WS_PORT});
wss.on('connection', function(ws) {
    ws._id = lastId++;
    
    var urlParsed = url.parse(ws.upgradeReq.url, true);
    urlParsed.protocol = 'ws:';
    urlParsed.slashes = '//';
    urlParsed.hostname = 'localhost';
    var wsUpstreamUrlPort = DEVTOOLS_PORT; //9222; //urlParsed.query._crmuxOrigPort;
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
             console.log('e> ' + message.cyan);
             s.send(message);
           });
         } else {
           var idMap = upstreamMap[wsUpstreamUrl].localIdToRemote[msgObj.id];
           msgObj.id = idMap.id;
           idMap.client.send(JSON.stringify(msgObj));
           console.log(String(idMap.client._id).blue + "> " + idMap.message.yellow);
           console.log(String(idMap.client._id).blue + "> " + JSON.stringify(msgObj).green);
           delete upstreamMap[wsUpstreamUrl].localIdToRemote[msgObj.id];
         }
      });
    } else {
      upstreamSocket = upstreamMap[wsUpstreamUrl].socket;
      upstreamMap[wsUpstreamUrl].clients.push(ws);
    }

    ws._upstream = upstreamSocket;
    ws._upstream.params = upstreamMap[wsUpstreamUrl];

    ws.on('message', function(message) {
        // console.log('received: %s', message);
        //console.log(message);
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
        //console.log(upstream.params.localIdToRemote);
        //console.log('sending as: %s', JSON.stringify(msgObj));
        if (upstream.readyState == 0) {
          upstream.once('open', function() {
            console.log('OPENED!', upstream.readyState);
            upstream.send(JSON.stringify(msgObj));
          });
        } else
          upstream.send(JSON.stringify(msgObj));
    });
    ws.on('close', function() {
       // TODO: 
       // var upstream = ws._upstream;
       // for each key in upstream.params.localIdToRemote
       // delete all keys where ws._id = key.client._id

       var purged = upstreamMap[wsUpstreamUrl].clients.filter(
         function(s) { return s._id != ws._id; }
       );
       upstreamMap[wsUpstreamUrl].clients = purged;
    });
});

var cachedWsUrls = {};

http.createServer(function(req, res) {
  if (req.url == '/json') {
    upReq = http.request({
      port: DEVTOOLS_PORT,
      path: req.url
    }, function(upRes) {
      upRes.pipe(bl(function(err, data) {
        var tabs = JSON.parse(data.toString());
        var wsUrl, urlParsed, feUrlParsed;
        for (var i=0; i < tabs.length; ++i)
        {
          wsUrl = tabs[i].webSocketDebuggerUrl;

          if (typeof wsUrl == 'undefined') {
             wsUrl = cachedWsUrls[tabs[i].thumbnailUrl];
          } 
          if (typeof wsUrl == 'undefined')
             continue;

          urlParsed = url.parse(wsUrl, true);
          //urlParsed.query._crmuxOrigPort = urlParsed.port;
          urlParsed.port = WS_PORT;
          delete urlParsed.host;
          tabs[i].webSocketDebuggerUrl = url.format(urlParsed);

          // TODO: devtools don't undestend proper urlencoded query
          // TODO: fill a bug
          /*
          feUrlParsed = url.parse(tabs[i].devtoolsFrontendUrl, true);
          feUrlParsed.query.ws = url.format(urlParsed);
          delete feUrlParsed.path;
          delete feUrlParsed.href;
          delete feUrlParsed.search;
          tabs[i].devtoolsFrontendUrl = url.format(feUrlParsed);
          */
          console.log(tabs[i].devtoolsFrontendUrl, wsUrl, tabs[i].webSocketDebuggerUrl);
          if (tabs[i].devtoolsFrontendUrl)
            tabs[i].devtoolsFrontendUrl = tabs[i].devtoolsFrontendUrl.replace(wsUrl.slice(5), tabs[i].webSocketDebuggerUrl.slice(5));
          console.log(tabs[i].devtoolsFrontendUrl, wsUrl, tabs[i].webSocketDebuggerUrl);
          // TODO: cache devtoolsFrontendUrl as well
          cachedWsUrls[tabs[i].thumbnailUrl] = wsUrl;
        }
        res.end(JSON.stringify(tabs));
      }));
    }).end();
  } else {
    var options = {};
    options.port = DEVTOOLS_PORT;
    options.path = req.url;
    http.request(options, function(upRes) {
      upRes.pipe(res);
    }).end();
  }
}).listen(MULTIPLEX_PORT);
