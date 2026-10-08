# Writing Jam Reborn plugins

A plugin is a folder inside `plugins/` with a `plugin.json` file. Jam loads every plugin folder at startup, and again when you press **Reload Plugins** (the circular arrows in the sidebar).

There are two kinds:

| Kind | `type` | What it is |
|---|---|---|
| **Window plugin** | `"ui"` | An HTML page that opens in its own window when you click it in the Plugins hub. |
| **Background plugin** | `"game"` | A JavaScript module that runs as soon as Jam starts. Usually adds console commands (like `!achievements`) or reacts to packets. |

## plugin.json

```json
{
  "name": "My Plugin",
  "description": "One sentence that explains what it does.",
  "author": "YourName",
  "main": "index.html",
  "type": "ui",
  "category": "Tools",
  "icon": "fa-wrench"
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Shown in the Plugins hub. Must be unique. |
| `description` | recommended | Shown on the plugin's card. |
| `author` | recommended | Shown on the card. |
| `main` | yes | `index.html` for window plugins, `index.js` for background plugins. |
| `type` | yes | `"ui"` or `"game"`. |
| `category` | no | Groups the plugin in the hub. Built-in categories: `Tools`, `Explore`, `Customize`, `Gameplay`. Anything else works too; missing means `Other`. |
| `icon` | no | Any free Font Awesome 5 solid icon name, like `fa-wrench` ([list](https://fontawesome.com/v5/search?m=free&s=solid)). |
| `dependencies` | no | npm packages to install for the plugin, as `{ "package": "version" }`. |

A good example to copy is `plugins/glow-picker`.

## Approval for new plugins

Plugins that don't ship with Jam Reborn don't run until the user approves them. A new plugin shows up under **Plugins** with **Enable** and **Keep off** buttons. Plugins can do anything Jam can (including sending packets for the user's account), so tell users where your plugin comes from.

## Window plugins

Your page gets a `jam` object (as `window.jam`) with:

| | |
|---|---|
| `jam.dispatch` | Send packets, read state, hook packets (see below). |
| `jam.application` | The app: `consoleMessage()`, settings, item names (`jam.application.items`). |
| `jam.onPacket(fn)` | Watch every packet. Stops automatically when your window closes. |

Jam's stylesheet is added to every plugin window automatically. For the helpers below, you can also include:

```html
<script src="app://assets/scripts/plugin-utils.js"></script>
```

`jam` is set right after your window opens, so if your script runs very early, wait for it. With `plugin-utils.js` included that's one line:

```js
const jam = await waitForJam()
```

## Background plugins

`main` points at a module that exports a function (or class). Jam calls it with `{ application, dispatch }`:

```js
module.exports = function ({ application, dispatch }) {
  dispatch.onCommand({
    name: 'hello',
    description: 'Says hello.',
    callback: ({ parameters }) => {
      application.consoleMessage({ message: `Hello ${parameters[0] || 'there'}!`, type: 'success' })
    }
  })
}
```

Users run commands by typing `hello` (or `hello world`) in the box at the bottom of Jam.

## Packets

Animal Jam sends three formats. Most game traffic is the `%xt%` format:

```
%xt%o%qat%844480%questready%0%     <- sent by the game ("o" = outgoing), command "qat"
%xt%rj%844423%1%denYourName%844480%  <- sent by the server, command "rj"
```

Fields are separated by `%`. In `message.value` (an array from splitting on `%`), the command is at index 3 for outgoing packets and index 2 for incoming ones.

### Watching packets

**Every packet, read-only** (the easiest way):

```js
const stop = jam.onPacket(packet => {
  // packet.raw        the full text, e.g. "%xt%rj%..."
  // packet.direction  "in" = to the game, "out" = to the server
  // packet.type       e.g. "rj" (or null if unknown)
  // packet.fromPlugin true if a plugin sent it rather than the game/server
  // packet.timestamp  milliseconds
})
// stop() to stop listening (window plugins stop automatically on close)
```

Background plugins use `dispatch.onPacket(fn)` the same way.

**Hooking a specific packet** (can change or block it):

```js
dispatch.onMessage({
  type: 'aj',           // 'aj' = from the server, 'connection' = from the game, '*' = both
  message: 'rj',        // the packet command
  callback: ({ message }) => {
    // message.value is the packet split on '%'
    // message.send = false blocks it from going through
  }
})
```

### Sending packets

```js
const room = dispatch.getState('room')
dispatch.sendRemoteMessage(`%xt%o%qat%${room}%questready%0%`)  // to the server
dispatch.sendConnectionMessage('%xt%ua%Hello!%0%')            // to your own game only
dispatch.serverMessage('Hello!')                              // shortcut: popup in your game
```

Packets sent to the server are limited to 20 per second by default (users can change this in Settings). Extra packets wait their turn instead of being dropped. Sending too fast or sending packets the server doesn't expect can get accounts kicked or banned.

## State

| Key | Value |
|---|---|
| `dispatch.getState('room')` | The current room's number, used in most packets. |
| `dispatch.getState('internalRoomId')` | Same as `room`. |
| `dispatch.getState('roomName')` | The current room's name, e.g. `denYourName` for your den. |
| `dispatch.getState('player')` | Your player data from the login packet. |

`dispatch.setState(key, value)` stores your own values.

## Helpers

| | |
|---|---|
| `dispatch.wait(ms)` | Promise that resolves after `ms` milliseconds. |
| `dispatch.setInterval(fn, ms)` / `dispatch.clearInterval(id)` | Intervals Jam cleans up on disconnect. |
| `application.consoleMessage({ message, type })` | Prints to Jam's console. `type`: `success`, `error`, `warn`, `notify`, `wait`. |
| `console.log(...)` | Also prints to Jam's console. |

## Tips

- **Check Jam's console** for errors when your plugin doesn't load. A bad `plugin.json` is the most common cause.
- **Streaming mode:** if your window shows names, pass text through `jam.application.streamingMode.mask(text)` so users' real usernames stay hidden on stream.
- **Packet Inspector** shows every packet, including ones your plugin sends (tagged **plugin**), and explains many of them.
