# Installing a brigade station on a server

**A station is installed once per machine, then projects are added to it.** This guide installs a
server's station, from the command to the running station. It talks about no project: a
project is not an installation, it is a line in a station's configuration, and it is added
later, from the app.

On a Mac, the same command installs the station under your account, so that it runs even when the
app is closed: see "On a Mac", at the end. On Windows, one PowerShell command does the same: see
"On Windows", after it.

**You can get help.** Paste this guide into an assistant (Claude, for example) and
ask it to walk you through step by step: everything it needs to know is here, and there is only
one command to type.

## What you need

| | |
|---|---|
| **A Debian server** | Debian 12 or newer (or a derivative, Ubuntu included), on `amd64` or `arm64`, with systemd — not a container. It is always on: it is what will make the cooks work. |
| **Root access, once** | `sudo`, or a root session. It is for the installation only: the station's day-to-day life will never need it again. |
| **The network** | the server reaches GitHub and its distribution's package repositories. |
| **A local disk** | `/var/lib` is neither on `nfs` nor on `cifs` (`df -T /var/lib`): each project's lock depends on it. |

| **Your GitHub account** | for the GitHub connection, at the end of the command, only once: a code to type on a GitHub page. It is the account the station reads and pushes with. |
| **Your Claude Max subscription** | for the Max connection, right after, only once: a link to open in your browser, a code to copy back. |

## 1. The command

On the server, paste:

```sh
curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sh
```

That is all: it is the same command on a Mac. Under an ordinary account, it runs its root steps
through `sudo`, which may ask your password; in a root session, it needs none. Without `curl`, the
same with `wget -qO-` in place of `curl -fsSL`. (`… | sudo sh` works too.)

The command downloads the `brigade-station` package of the latest published version, hands it to
`apt` — which installs what it depends on (`git`, `gh`, `bubblewrap`…) —, waits for the station
to start, then does the **GitHub connection** and the **Max connection** (step 2). Allow one to two
minutes, plus the time to log in. Nothing is left to edit by hand afterwards: no drop-in, no
environment file.

## 2. What you should see

The command shows the service's state, then two lines:

```
● brigade-station.service - brigade — la station de cette machine (tous ses projets)
     Loaded: loaded (…/brigade-station.service; enabled; …)
     Active: active (running) since …
…
… brigade : station démarrée — pid …, configuration /var/lib/brigade/projets ; aucun projet servi

brigade : station installée et active — <version>
brigade : tout ce qu'elle demande au système vient avec son paquet : sa vie courante ne demande aucune commande root
```

**`active (running)` and `aucun projet servi`: the station is installed.** It is running, it will
restart with the machine, and it waits for its projects.

### The GitHub connection

The command first connects the station's `brigade` account to GitHub: `gh auth login --web`, under
that account. `gh` shows a one-time code and the address `https://github.com/login/device`: open it
in your browser (on any machine), type the code, and authorize. Then `gh auth setup-git`, so that
`git` reads and pushes through it. Already connected — a rerun —, it is not redone.

### The Max connection

The command goes on to connect the station to your Claude Max subscription — with the GitHub
connection, the only time it asks you for anything, and it does not come back:

```
brigade : la connexion Max du compte brigade — le seul moment où elle te demande quelque chose
connexion Max — `claude setup-token` va te donner un lien : ouvre-le, connecte-toi avec ton compte Claude Max, puis recopie ici le code qu'il affiche. Il ne se fait qu'une fois
…
connexion Max faite : le jeton est rangé, lisible du seul compte de la station, avec sa date de création à côté — la station n'a plus à se reconnecter
brigade : la suite : l'appairage avec l'app (…)
```

1. `claude` shows a link: open it in your browser, on any machine.
2. Log in with your Max subscription account, and authorize Claude Code.
3. The page gives you a code: paste it into the server's terminal.

The step shows the `claude setup-token` interface as it goes, but **never the token**: it is
masked on screen (`sk-ant-…`) and written in no log. If `setup-token` shows
nothing for three minutes, the step stops it and says so in one line (`connexion Max non faite —
… relance l'étape pour réessayer`): rerun it alone, it redoes the same course.

The connection goes through **the official `claude` binary**, under the `brigade` account: if it
is not on the server, the command installs it first, through Anthropic's installer. `claude
setup-token` creates a **long-lived token**; the command stores it without ever displaying it,
then restarts the station so it reads it. Your Max quota will never be consumed other than by
`claude`.

**Where the token is, and how to check its permissions:**

| | |
|---|---|
| `/etc/brigade/claude-token` | the token, alone in the file — `600`, owned by the `brigade` account |
| `/etc/brigade/claude-token.cree` | its creation date (without the token), which will serve to warn you of its expiry |
| `/etc/brigade/jeton.env` | one line, which tells the station's unit where to read the token |

```sh
stat -c '%a %U' /etc/brigade/claude-token     # expected: 600 brigade
```

**If a connection fails** (`brigade : la station est installée, mais sa connexion … n'est pas
faite`), the line above it says why: rerun the same command. It reinstalls nothing, leaves the
station running, and does not redo a connection already made nor a token already stored.
**If the command had no terminal** (run from a script), it says so, and stops
before the connections: rerun it from a terminal on the server.

If the command stops on `brigade : installation refusée — …`, the line says why: the
machine is not a Debian, its architecture has no package, the download failed, or
`apt` refused (its output is just above). Nothing is left half-installed that `apt` cannot
resume: fix what it says, and rerun the same command.

## 3. What the installation put in place

- **The `brigade-station` service**: a single one for the whole machine, whatever the number of
  projects. Adding or removing a project will touch no system file.
- **The `brigade` account**, under which the station and its cooks run. It is the one that did the
  Max connection, and the only one that reads the token.
- **The Max connection token** and its creation date, in `/etc/brigade` (step 2).
- **`/var/lib/brigade`**, where the station will keep the configuration, the log and the clone of
  each of its projects.
- **Its update**, two minutes after each station start then every ten
  minutes: see "6. Updating, on its own".
- **Its doors** (`brigade-station-porte`), the only network exit of the station and its cooks.
  The station reaches only the machine itself; what a project launches goes out through that
  project's door, which lets through only Anthropic, GitHub and what the project's repo declares in
  `.claude/brigade/reseau`. What one project opens is not open for another. Each door takes
  its port by itself: there is nothing to set.

And nothing else: no `sudo` rule, and in `/etc` only the token's three files. Everything comes from the package, and
follows it: when the station moves to a new version, its units, its rights and its timer
move with it. Nothing the station asks of the system therefore waits for a root action from
you.

## 4. Reviewing the station, later

Without root, from any account on the server:

```sh
systemctl status brigade-station
```

`active (running)` means it is running. The last lines of its log only appear there
if your account reads the system journal; otherwise, the app will show them to you.

## 5. The Max connection token

The token is created once, at installation, and the station asks you for nothing after that:
nothing to refresh. **It lives a year**: thirty days before its expiry, the station's queue
announces it (`jeton de la connexion Max près de son échéance`), with the only action to take —
redo it, as below. It also says so if its creation date
(`/etc/brigade/claude-token.cree`) is missing or cannot be read.

**If the box is compromised, revoke the token from your Claude account (claude.ai, in
settings, among the connected sessions and apps of Claude Code), then delete
`/etc/brigade/claude-token`: a token taken from you is of no use any more.**

To create a new one (after a revocation, or to replace it), delete that file and rerun
the step 1 command: it only redoes the Max connection — the link, the code.

## 6. Updating, on its own

When a station version is published, the station moves to it on its own, like a browser — you
have nothing to do. Every ten minutes, its updater (`brigade-station-mise-a-jour`, delivered
by the package, the only part of the station that runs as root) looks at the published versions;
if there is a newer one, it hands it to `apt`. The package puts in the new code and its units,
then restarts the station — its only process: **the cooks in flight finish their work**, and the
station that comes back up takes them over.

The new version is kept when the station says it has started on it and serves all the projects it
served before. Otherwise, **it goes back on its own to the previous version**, whose package it
kept. A failed version is not retried; the next one will be. In both cases, each project's queue
says so in one line, the same day:

```
  passée en version 0.20261016.091500+g1a2b3c4 à 09 h 17
  mise à jour vers la version 0.20261016.120000+g5d6e7f8 ratée à 12 h 03 : la station s'est arrêtée en échec en 0.20261016.120000+g5d6e7f8 (systemd : failed) — revenue en version 0.20261016.091500+g1a2b3c4 ; 0.20261016.120000+g5d6e7f8 n'est pas réessayée, la suivante le sera
```

**Freezing the version.** So that no new version is installed, the station reads a setting
in `/var/lib/brigade/reglages`:

```
gel=oui
```

`gel=non`, or the file removed, lifts the freeze: the waiting version is installed on the next
pass. The app will set it with a button; until then, it is this file. A badly written freeze
freezes, when in doubt.

**Where the update stands**: `/var/lib/brigade-station/etat.json` — the installed version, the
latest published one, the freeze, what holds back the next one and what the last update gave. The
same state, in plain text, without root:

```sh
cd /usr/lib/brigade-station/runtime && BRIGADE_STATION_DIR=/var/lib/brigade BRIGADE_MISE_A_JOUR_DIR=/var/lib/brigade-station /usr/lib/brigade-station/node/bin/node src/mise-a-jour/main.ts etat
```

## On a Mac

The same command, in a Terminal, under your account — **without `sudo`**:

```sh
curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sh
```

It needs the Command Line Tools (`git`): if they are missing, macOS offers to install them, then you
rerun the command. It installs `gh` (by Homebrew, or from its release) and `claude` (by its official
installer) if they are missing, then:

- the station's runtime of the latest version and the `node` it requires, checked against the
  checksums nodejs.org publishes, under `~/.local/share/brigade-station/`;
- a launchd agent, `~/Library/LaunchAgents/brigade.station.plist`, which starts the station when you
  log in and restarts it if it stops — its log is `~/Library/Logs/brigade-station.log`;
- then the GitHub connection (`gh auth login --web`) and the Claude connection (`claude auth login`,
  like the app's button), under your account, once each.

`launchctl print gui/$(id -u)/brigade.station` says `state = running`. The station keeps the same
directory as the app's (`~/.config/brigade/station`): only one of them runs at a time, and the
other waits for it to stop. Rerunning the command is how a Mac station moves to the latest version:
it replaces only what changed, and restarts the station only then.

## On Windows

One command, pasted into **PowerShell** (Windows 10 version 1803 or later, or Windows 11, on x64 or
ARM64), under your account — **not** in an administrator window:

```powershell
irm https://github.com/benomite/brigade/releases/latest/download/installer-station.ps1 | iex
```

It is the Windows side of the Mac command (`runtime/deploy/windows/installer-station.ps1`), and
installs the same station, configured the same way. If they are missing, it installs **Git for
Windows** and **`gh`** with `winget` — Windows may ask you to allow their installers — and
**`claude`** with its official installer. Then:

- the station's runtime of the latest version (`brigade-station-windows.zip`, the same runtime as
  the Mac's) and the `node` it requires, checked against the checksums nodejs.org publishes, under
  `%LOCALAPPDATA%\brigade-station\`;
- its launcher, `%LOCALAPPDATA%\brigade-station\lancer-station.ps1`, started hidden when you log in
  (the `brigade-station` value of `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, listed in
  Task Manager's startup apps) and started right away; it relaunches the station five seconds after
  it stops on a failure, like a server's service — not when it refused to start. The station's log
  is `%LOCALAPPDATA%\brigade-station\brigade-station.log`;
- then the GitHub connection (`gh auth login --web`, then `gh auth setup-git`) and the Claude
  connection (`claude auth login`, like the app's button), under your account, once each.

The command ends on `brigade: station installed and running -- <version>`: the station runs. It
keeps the same directory as the app's (`%USERPROFILE%\.config\brigade\station`): only one of them
runs at a time, and the other waits for it to stop. Its messages are in English: Windows PowerShell
reads the script in the machine's code page, so it is kept plain ASCII.

Rerunning the command is safe, and it is how a Windows station moves to the latest version: it
replaces only what changed, stops and restarts the station only then — leaving its cooks to finish
their work, as on a server —, and does not redo a connection already made. If it stops on
`brigade: installation refused -- …` or `brigade: the station is installed, but …`, the line says
why: fix it, and rerun the same command. A station built by hand installs from its archive:
`powershell -ExecutionPolicy Bypass -File installer-station.ps1 .\brigade-station-windows.zip`.

## 7. What comes next — not yet in this guide

Two steps then bring the station to you. They are not yet written here: this
guide will gain them as they arrive.

1. **Pairing with the app** — the server shows a code, you type it in the app, and the station
   appears on its home: "en ligne · version X · aucun projet". The app will also show there the
   state of its update, and the button that freezes its version.
2. **Adding a project** — from the app: the GitHub repo, its stations, its primary. Without a
   terminal.
