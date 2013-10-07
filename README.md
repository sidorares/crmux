# crmux

Chrome developer tools remote protocol multiplexer.
Chrome does not allow more then one developer tools connection to the a tab. Crconsole multiplex multiple incoming connections into single websocket connection and transparently matches request and response message IDs

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

