# One station: the app coordinates, the stations cook

Date: 2026-11-27. Decided with the chef in conversation (#4245); this document is the design to plan from.

## Why

- **The second reaches into the box's internals.** On 27 Nov. the second ran `ssh` to read systemd's journal,
  restart `brigade-kitchen`, empty `/tmp`, read GitHub call counters and inspect sandboxes, instead of using a
  station the normal way. The chef: "bizarre". There is no ordinary way to know a station or act on it.
- **On Mac, the app and the station are tangled.** The kitchen runs from `Brigade.app/Contents/Resources/runtime`,
  started by app code (`app/src/station-background/`, `station-process/`, `workstation/`, `serve-here.ts`…), under the
  chef's own account. On the box, the station is a standalone package under a dedicated account. The two differ
  exactly where it matters: install, update, isolation, network gates.
- The chef wants **the app to coordinate and the stations to cook**, cleanly apart, to ease maintenance and make clear
  what a station is.

## Goals

- **One station package for Mac and Linux**: one archive, one `install.sh`, the same layout, the same service, the
  same `brigade` command, the same self-update, the same isolation.
- **A dedicated `brigade` account on every station**, the Mac included: the cooks have no access to the chef's files
  or keys, physically, not only through a sandbox.
- **The same network gates on Mac** as on the box: the station's account has no network but through its gate.
- **A `brigade` command for operating a station**, the same everywhere, run locally or through `ssh`: the second
  gives the chef commands to run (`brigade status`, `brigade logs`…), on his Mac or on the box, and so does the app.
- **The app contains no kitchen.** It reads GitHub, reads stations through `brigade status`, and on a computer that is
  not a station it offers to make it one.
- **Windows: the Linux station inside WSL**, if a trial on the chef's Windows PC proves it works; the Windows station
  code goes either way.

## Non-goals

- Making Windows cook natively (no sandbox exists for it).
- Changing the kitchen itself (`runtime/src/kitchen/`), its agents or its GitHub reading, beyond the one operator
  status file below.
- A remote control channel from the app to a station: acting on a station is a command line, local or through `ssh`.

## Anti-goals

- **Two packages, two installers, two update paths.** The point is one.
- **Loosening isolation on any station**: no station cooks without its sandbox, its dedicated account and its
  network gate; one that cannot set them up refuses to cook, saying why in one line.
- **A daemon or API for the app to call.** `brigade status` read locally or over `ssh` is the whole interface.
- **The app keeping a fallback kitchen** "for when no station is installed".

## Constraints

- Node 26, the runtime as today (`runtime/src/`), no build.
- The station's state directory, its gate configuration and its token stay unreadable to the cooks
  (`BRIGADE_SANDBOX_HIDDEN` today).
- Releases stay "on push to main" (`publier-station`), the epic flow of #4696 included.
- Simplification first: every task says what it removes.

## Approaches considered

- **A. One archive for Mac and Linux, one `install.sh`** — chosen by the chef. Same content everywhere; the script
  detects the OS, creates the account, installs the systemd or launchd service and starts it; the station updates
  itself by downloading the next archive. The `.deb` and the station embedded in the Mac app go. Cost: no `apt`,
  which nobody uses since the station updates itself.
- **B. One native package per OS** (`.deb`, `.pkg`). Rejected: two packages, two installers, two update paths, the
  very difference the chef wants gone.

## The design

### The archive and its layout

`brigade-station-<version>-<os>-<arch>.tar.gz`, published by `publier-station`, for `linux-x64`, `darwin-arm64`
(and `linux-arm64` if the box ever needs it). Content: `runtime/` (as the `.deb` carries it today), `node/`, `bin/brigade`,
`install.sh`, `services/` (the systemd units of `runtime/paquet/systemd/` and their launchd equivalents).

Layout, the same on both:

| What | Linux | Mac |
|---|---|---|
| Installed versions | `/opt/brigade-station/<version>/`, `current` → the running one | the same |
| Station state (`BRIGADE_STATION_DIR`) | `/var/lib/brigade` | `/Library/Application Support/brigade` (chosen: macOS's place for daemon state) |
| Token and secrets | `/etc/brigade/` | `/Library/Application Support/brigade/etc/` |
| Account | system user `brigade` | hidden system user `brigade` (`dscl`, UID below 500) |
| Command | `/usr/local/bin/brigade` → `current/bin/brigade` | the same |

### Services

- **The station** (the kitchen, `runtime/src/kitchen/main.ts`) as `brigade`, with no network but loopback:
  systemd `IPAddressDeny=any`/`IPAddressAllow=localhost` as today; on Mac a `pf` anchor `brigade` that blocks every
  outgoing packet of user `brigade` except to loopback.
- **A Mac cook goes out through the gate alone, as on the box** (chef's decision): `HTTPS_PROXY` points at the
  project's gate, `pf` blocks everything else, and Claude Code's own network filter (`network.allowedDomains`,
  `runtime/src/bac-a-sable/configuration.ts`) is turned off, since its proxy runs as `brigade` and `pf` would block
  it. The guarantee is the box's, by the box's mechanism.
- **The gate** (`runtime/src/station/tenir-portes.ts`), the only way out, as today, under an account the filter does
  not block (on Mac: `_brigade-gate`, or root if a second account is not needed: builder's call, same guarantee).
- **The update**, as root, on a timer (systemd timer, launchd `StartInterval`): `runtime/src/mise-a-jour/` downloads
  the next archive, unpacks it beside the current one, switches `current`, restarts the station, and switches back if
  the station does not start (the rollback it already does for the `.deb`).
- **The sandbox**: `bwrap` on Linux, Claude Code's sandbox on Mac (as today, #4483).

### Credentials (chef's decision: as on the box)

The station cooks with the chef's GitHub token and a Claude long-lived token (`claude setup-token`), kept in the
station's secrets directory, which the sandbox hides from the cooks (`BRIGADE_SANDBOX_HIDDEN`), as `/etc/brigade` is
on the box today. `claude setup-token` needs a browser: "Make this computer cook" opens a terminal with the install
command rather than doing it silently.

### The operator status file

The kitchen writes `<station>/status.json`, readable by the chef (0644, outside the hidden directories): version,
since when, projects served, cooks running (ticket and since when), last update and its result, GitHub quota left
(from `gh api rate_limit`, which GitHub does not count), and why it refuses to cook if it does. It is the only
change to the kitchen; `brigade status` prints it.

### The `brigade` command

The same on every station, run as the chef (it reads what the station publishes for operators, never its secrets):

| Command | Says or does |
|---|---|
| `brigade status [--json]` | version, running or not since when, projects served, cooks running, last update and its result, disk free, GitHub quota left, why it refuses to cook if it does |
| `brigade logs [--since 1h] [<project>]` | the station's journal (journalctl, or the launchd log files) |
| `brigade restart` | restarts the station (sudo) |
| `brigade project add <name> <owner/repo> [--places N]` / `brigade project remove <name>` | edits `<station>/kitchen/projects` |
| `brigade update [--check]` | runs an update pass now, or says what it would do |
| `brigade uninstall` | removes the services, the account and the installed versions (keeps the state unless `--purge`) |

The command line is for the chef and the second: `brigade status` locally, `ssh <host> brigade status` for another
station. The second documents the commands in `docs/station.md`, the one page that says what a station is.

### The app

- The Mac app no longer contains `runtime/` nor starts a kitchen: `app/src/station-background/`, `station-process/`,
  `workstation/` and what only they use go, with the app's copy of the runtime in its package.
- On a computer that is not a station, the app offers **"Make this computer cook"**: it runs `install.sh` with
  administrator rights (macOS's authorization prompt), or shows the one command to paste.
- The app keeps reading stations from GitHub (the pairing gists, `app/src/stations/stations.ts`) and keeps
  assigning projects through the selection gist (`app/src/projects/projects.ts`). The station writes the facts of
  `status.json` into its pairing gist, which the Stations view shows. No `ssh` from the app. (Second's call.)

### Windows

- The Windows station code goes (`runtime/deploy/windows/installer-station.ps1` and what only it uses).
- **Trial, by the chef on his Windows PC with WSL2**: install the Linux archive in an Ubuntu WSL distribution with
  systemd enabled, and check (1) the gate and `IPAddressDeny` work (cgroup v2), (2) `bwrap` runs a cook, (3) the
  station keeps running with no terminal open and starts again at login, (4) clones live in the Linux file system.
  The second writes the commands to run. If the four hold, the Windows app offers "Make this computer cook" through
  `wsl`; if not, Windows has no station and the app says so.

### Migration

- **The box**: the `.deb` is replaced by the archive. Its last version's `postinst` (or the update) installs the
  archive layout, moves `/usr/lib/brigade-station` to `/opt/brigade-station/<version>`, keeps `/var/lib/brigade` and
  `/etc/brigade`, and removes the `.deb`'s units.
- **The chef's Mac**: the first app release without a kitchen offers "Make this computer cook" and moves the project
  lines of the embedded station (`~/.config/brigade/station/kitchen/projects`) to the new station's, without their
  `CLONE=` paths: the new station clones afresh under `brigade`, and work in flight in the old station is dropped (it
  is cooked again). (Second's call.)

### What this removes

- The `.deb`, `runtime/paquet/debian/`, and its Debian-only update path.
- The station embedded in the Mac app (`app/src/station-background/`, `station-process/`, `workstation/`, the runtime
  copied into `Brigade.app`), and `runtime/deploy/installer-station.sh`'s launchd agent under the chef's account.
- The Windows station (`runtime/deploy/windows/`).
- The second's `ssh` into systemd, `/tmp` and counters: replaced by `brigade status` and `brigade logs`.

## Left to the builder

- The exact `pf` anchor and how the gate's process escapes it (a second account, or root).
- The launchd plists, and the systemd units' paths once under `/opt`.
- How `publier-station` builds the archives (a macOS runner for `darwin-arm64`).
- The JSON shape of `brigade status --json`, as long as it carries the table's facts.

## Done when

- The box and the chef's Mac run the same archive, installed by `install.sh`, under a `brigade` account, with the
  network gate, and update themselves from it.
- `brigade status`, `brigade logs`, `brigade restart` give the same output on both, locally and over `ssh`.
- The Mac app contains no kitchen; "Make this computer cook" installs a station.
- The Windows trial's result is written on its ticket, and the Windows app follows it.
- The removals above are done.
