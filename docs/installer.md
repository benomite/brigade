# Install a station

A **station** is the machine that cooks your tickets: a Linux server, a Mac or a Windows PC. You need
a GitHub account and a Claude Max subscription (an API key does not fit).

**One command, in a terminal on that machine:**

| System | Command |
|---|---|
| Linux (systemd) | `curl -fsSL https://github.com/benomite/brigade/releases/download/station/brigade-station-linux-x64.tar.gz \| tar xz && sudo ./install.sh` |

On a Mac, take `brigade-station-darwin-arm64.tar.gz` and run `./install.sh` without `sudo`. It installs the station, starts it, and keeps it up to date. Rerunning it is safe.

**Sign in, once each.** The command asks for them at the end: GitHub (`gh auth login --web`), then
Claude (your Max account). Nothing else is written by hand.

More: [`installation-station.md`](installation-station.md) (what the command puts in place, updates,
the Max token), [`installation.md`](installation.md) (the app, and a first ticket),
[`app.md`](app.md) (every screen).
