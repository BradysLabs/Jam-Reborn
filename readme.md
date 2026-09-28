<div align="center"> <img src="assets/icon.png" alt="Strawberry Jam Logo" width="150"/> <br/> <a href='https://discord.gg/UvXzA2gK5W'> <img src="https://img.shields.io/badge/Discord-Join%20the%20server-5865F2?logo=discord&logoColor=white" alt="Join the Discord" /> </a> </div> <br />

Jam is a modular man-in-the-middle proxy designed for Animal Jam Classic. Built with Node.js and Electron, Jam provides powerful tools and flexibility for your Animal Jam experience.

Unofficial community fork. This is a community-maintained version of Jam, not the original release. It is not affiliated with or endorsed by WildWorks or Animal Jam. See Disclaimer.

What's new in 5.0.1
Fixed the connection to Animal Jam's servers. Jam now opens its secure connection to the server's resolved IP address and sends the hostname as the TLS server name. The old connection method was dropped by Animal Jam's load balancer, which left the game stuck on an endless loading screen.
Fixed a message-sending bug. The null terminator could be skipped when the socket was under load, corrupting the message stream.
Better error reporting. Socket errors that happen after connecting are now shown in the Jam console instead of failing silently.
Features
Modular Architecture: Extend and customize your proxy setup with various plugins.
User-Friendly Interface: Developed with Electron for a seamless desktop experience.
Community Support: Questions and bug reports are welcome on Discord and in GitHub Issues.
Table of Contents
Installation
Windows
MacOS
Run from source
Disclaimer
Credits and License
Installation
Windows
Download the latest version of Jam-Setup.exe.
Extract the downloaded file.
Run jam.exe to start the application.
MacOS
Download the latest version of Jam.dmg.
Mount the downloaded file.
Install Jam by moving it to the Applications folder
Run sudo /Applications/Jam.app/Contents/MacOS/Jam to start the application.
Run from source
Clone the repository.
Install dependencies with npm install.
Run npm run dev to start the application.
Disclaimer

Jam is an unofficial tool. It is not affiliated with, endorsed by, or supported by WildWorks or Animal Jam. Tools that sit between the game and its servers may be against Animal Jam's terms of service, and using one could put your account at risk. Use it at your own risk.

Never share your Animal Jam username or password with anyone, including in the Discord server or in GitHub Issues.

Credits and License

Jam was created by Sxip and contributors. This fork builds on their work.

Released under the MIT License. The original copyright notice is kept, as the license requires.