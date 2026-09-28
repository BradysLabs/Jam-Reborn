Jam Reborn is a modular man-in-the-middle proxy designed for [Animal Jam Classic](https://classic.animaljam.com/). Built with [Node.js](https://nodejs.org/) and [Electron](https://www.electronjs.org/), Jam provides powerful tools and flexibility for your Animal Jam experience.

**Unofficial community fork.** This is a community-maintained version of Jam, not the original release. It is not affiliated with or endorsed by WildWorks or Animal Jam. See [Disclaimer](#disclaimer).

[Join the Discord](https://discord.gg/UvXzA2gK5W) · [Latest Release](https://github.com/BradysLabs/Jam-Reborn/releases/latest)

## What's new in 5.0.1

* **Fixed the connection to Animal Jam's servers.** Jam now opens its secure connection to the server's resolved IP address and sends the hostname as the TLS server name. The old connection method was dropped by Animal Jam's load balancer, which left the game stuck on an endless loading screen.
* **Fixed a message-sending bug.** The null terminator could be skipped when the socket was under load, corrupting the message stream.
* **Better error reporting.** Socket errors that happen after connecting are now shown in the Jam console instead of failing silently.

## Features

* Modular Architecture: Extend and customize your proxy setup with various plugins.
* User-Friendly Interface: Developed with Electron for a seamless desktop experience.
* Community Support: Questions and bug reports are welcome on [Discord](https://discord.gg/UvXzA2gK5W) and in [GitHub Issues](https://github.com/BradysLabs/Jam-Reborn/issues).

## Table of Contents

* [Installation](#installation)
  * [Windows](#windows)
  * [MacOS](#macos)
  * [Run from source](#run-from-source)
* [Disclaimer](#disclaimer)
* [Credits and License](#credits-and-license)

## Installation

### Windows

1. Download the latest version of [Jam-Setup.exe](https://github.com/BradysLabs/Jam-Reborn/releases/latest).
2. Run the installer.
3. Launch `Jam` from your desktop or Start menu shortcut.

### MacOS

1. Download the latest version of [Jam.dmg](https://github.com/BradysLabs/Jam-Reborn/releases/latest).
2. Mount the downloaded file.
3. Install `Jam` by moving it to the Applications folder.
4. Run `sudo /Applications/Jam.app/Contents/MacOS/Jam` to start the application.

### Run from source

1. Clone the repository.
2. Install dependencies with `npm install`.
3. Run `npm run dev` to start the application.

## Disclaimer

Jam is an unofficial tool. It is not affiliated with, endorsed by, or supported by WildWorks or Animal Jam. Tools that sit between the game and its servers may be against Animal Jam's terms of service, and using one could put your account at risk. Use it at your own risk.

Never share your Animal Jam username or password with anyone, including in the Discord server or in GitHub Issues.

## Credits and License

Jam was created by Sxip and contributors. This fork builds on their work.

Released under the [MIT License](LICENSE). The original copyright notice is kept, as the license requires.
