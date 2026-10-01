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

## What's new in 6.1.0

* **Asset Browser.** Browse every clothing and den item with names, values and members-only status. Search by name, id or price range, view each item's raw game data, open any of the game's data files, and build content server addresses.
* **Masterpiece Studio.** Turn a picture into a masterpiece file with crop, zoom, fit and stretch, then submit it in-game the normal way. You can also open masterpiece files to get the picture back out.
* **Glow Picker.** Choose your glow from presets or any RGB color, and hold one color, cycle your favorites, or go random. Replaces the Glow command.
* **Packet Inspector, rebuilt.** Category filters, muting and pinning, a Packet Guide with 48 documented packets, side-by-side packet comparison, your own notes on any packet, and text or JSON export.
* **Item names everywhere.** Item names and prices load from the game's data files and refresh automatically when Animal Jam updates.
* **Fixes.** Includes the 6.0.1 fix for Play launching the normal Animal Jam client on new installs.


</details>

## Included plugins

| Plugin | Type | What it does |
|---|---|---|
| Asset Browser | Window | Browse every item, the game's data files and their addresses |
| Masterpiece Studio | Window | Turn a picture into a masterpiece file, or open one |
| Glow Picker | Window | Pick your glow color from presets or RGB |
| Room Browser | Window | Search and warp to any public room |
| Packet Inspector | Window | Live packet viewer with filters, a packet guide and comparison |
| Packet Replay | Window | Save, explain, and send packets |
| Membership | Command | Shows the game as a member on your screen only |
| Achievements
