# Install a station

A **station** is the machine that cooks your tickets: a Linux server, a Mac or a Windows PC. You need
a GitHub account and a Claude Max subscription (an API key does not fit).

**One command, in a terminal on that machine:**

| System | Command |
|---|---|
| Linux (Debian, Ubuntu, systemd) and Mac | `curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh \| sh` |
| Windows (PowerShell) | `irm https://github.com/benomite/brigade/releases/latest/download/installer-station.ps1 \| iex` |

It installs the station, starts it, and keeps it up to date. Rerunning it is safe.

**Sign in, once each.** The command asks for them at the end: GitHub (`gh auth login --web`), then
Claude (your Max account). Nothing else is written by hand.

**Pick your projects in the app.** Open the app signed in to the same GitHub account: the station
is listed on the home. Tick the projects it should serve, then put the label `fire` on a ticket.

More: [`installation-station.md`](installation-station.md) (what the command puts in place, updates,
the Max token), [`installation.md`](installation.md) (the app, and a first ticket),
[`app.md`](app.md) (every screen).
