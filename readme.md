<p align="center">
  <img src="assets/icon.png" alt="Jam Reborn" width="128">
</p>

<h1 align="center">Jam Reborn</h1>

<p align="center">
  A modular man-in-the-middle proxy for <a href="https://classic.animaljam.com/">Animal Jam Classic</a>.<br>
  <a href="https://discord.gg/UvXzA2gK5W">Join the Discord</a> · <a href="https://github.com/BradysLabs/Jam-Reborn/releases/latest">Download the latest release</a>
</p>

Jam Reborn sits between Animal Jam Classic and the game server, so plugins can read and act on the game's traffic. It's built with [Node.js](https://nodejs.org/) and [Electron](https://www.electronjs.org/).

**Unofficial community fork.** Jam Reborn is a community-maintained continuation of Jam. It is not affiliated with or endorsed by WildWorks or Animal Jam. See [Disclaimer](#disclaimer).

## What's new in 6.0.0

* **New name and logo.** Jam is now Jam Reborn.
* **How To guide.** A built-in guide for every plugin, plus a Getting Started page. Open it from the sidebar.
* **Room Browser.** Search and warp to any public room.
* **Packet Inspector.** Watch game traffic live with plain-English explanations.
* **Packet Replay.** Save, explain, and test packets, and build your own packet library.
* **Themes.** Five themes (Dark, Midnight, Slate, Void, Light) and custom accent colors in Settings → Appearance.
* **Plugin Manager.** Turn plugins on or off in Settings → Plugins.
* **Discord Rich Presence.** Shows "Playing Jam Reborn" on your Discord profile. Turn it off in Settings → Advanced.
* **Plugins ship with the app.** The Plugin Hub has been removed, and every plugin's code is in this repository.
* **Fixes.** Glow no longer freezes when you change rooms and has a speed option (`glow 300`). The connection fix from 5.0.1 is included.

## Included plugins

| Plugin | Type | What it does |
|---|---|---|
| Room Browser | Window | Search and warp to any public room |
| Packet Inspector | Window | Live packet viewer with explanations |
| Packet Replay | Window | Save, explain, and send packets |
| Glow | Command | Cycles your avatar's glow color (`glow`) |
| Membership | Command | Shows the game as a member on your screen only |
| Achievements | Command | Unlocks in-game achievements |
| Packet Spammer | Window | Sends packets repeatedly |

Every plugin has a full guide in the app under **How To**. Plugins that send packets to the server can get an account kicked or banned, so use them carefully.

## Installation

### Windows

1. Download [Jam-Reborn-Setup.exe](https://github.com/BradysLabs/Jam-Reborn/releases/latest).
2. Run the installer.
3. Launch **Jam Reborn** from your desktop or Start menu shortcut.
4. Click **Play** in the sidebar to start Animal Jam Classic through Jam Reborn.

### macOS

1. Download [Jam-Reborn.dmg](https://github.com/BradysLabs/Jam-Reborn/releases/latest).
2. Open the downloaded file and drag **Jam Reborn** into your Applications folder.
3. Start it from Terminal with:
   `sudo "/Applications/Jam Reborn.app/Contents/MacOS/Jam Reborn"`

   Jam Reborn needs `sudo` to listen on port 443. If macOS says the app can't be opened because the developer can't be verified, right-click the app in Applications, choose **Open**, then run the command again.

  
### Run from source

1. Clone the repository.
2. Install dependencies with `npm install`.
3. Run `npm run dev` to start the application.

## Upgrading from Jam 5.x

Jam Reborn installs as a new app, next to your old Jam install:

* To keep your plugins and settings, copy the `plugins` folder and `settings.json` from your old Jam install folder into the new Jam Reborn folder.
* Old versions of Jam won't update to Jam Reborn automatically. Download this release once, and future updates will be automatic.

## Writing plugins

A plugin is a folder in `plugins/` with a `plugin.json` and either an `index.js` (command plugins) or an `index.html` (window plugins). Add a `README.md` to the folder and it appears as that plugin's guide under **How To**. The included plugins are good examples to start from.

## Support

Questions and bug reports are welcome on [Discord](https://discord.gg/UvXzA2gK5W) and in [GitHub Issues](https://github.com/BradysLabs/Jam-Reborn/issues).

## Disclaimer

Jam Reborn is an unofficial tool. It is not affiliated with, endorsed by, or supported by WildWorks or Animal Jam. Tools that sit between the game and its servers may be against Animal Jam's terms of service, and using one could put your account at risk. Use it at your own risk.

Never share your Animal Jam username or password with anyone, including in the Discord server or in GitHub Issues.

## Credits and License

Jam was created by Sxip and contributors. Jam Reborn builds on their work.

Released under the [MIT License](LICENSE). The original copyright notice is kept, as the license requires.