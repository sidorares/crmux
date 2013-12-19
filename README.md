# crmux

Chrome developer tools remote protocol multiplexer.

Chrome does not allow more then one developer tools connection to the a tab. **crmux** multiplexes incoming connections into single websocket connection and transparently matches and translates JSON-RPC request and response message IDs from single local range to multiple remote ranges of ID'. Events are dispatched to all clients.


![crmux in Terminal](https://f.cloud.github.com/assets/173025/1279477/322e3122-2f38-11e3-8dfc-d9bb1b76d6e0.png)

## Install
With [node.js](http://nodejs.org/) and the npm package manager:

	npm install crmux -g

You can now use `crmux` from the command line.

## Connecting

Start chrome with remote protocol enabled:

```
google-chrome --remote-debugging-port=9222
```

Start `crmux`:

```
$> crmux 
```

Now you can attach more then one devtools client on port 9223 ( browse to `http://localhost:9223/` to see list of inspectable tabs )

## See also

  - [crconsole](https://github.com/sidorares/crconsole) - console developer tools client and REPL.
  - [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) - node.js client library for [Chrome DevTools Remote Debugging Protocol](https://developers.google.com/chrome-developer-tools/docs/protocol/1.0/), also features simple REPL.



[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/sidorares/crmux/trend.png)](https://bitdeli.com/free "Bitdeli Badge")

