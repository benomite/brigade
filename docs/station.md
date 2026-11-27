# The station

**A station is what cooks.** One per machine, it serves every project listed in its configuration, runs the cooks in their sandbox, and keeps itself up to date. This page says what it is made of and how it is operated. The step-by-step install is in [installation-station.md](installation-station.md); the kitchen's inside is in [runtime/README.md](runtime/README.md).

## The archive and `install.sh`

A release publishes the station as an archive per platform: `brigade-station-<version>-linux-x64.tar.gz` and `brigade-station-<version>-darwin-arm64.tar.gz`. It carries the runtime, the `node` it needs, its service definitions (`services/`), a `version` file and `install.sh`.

```sh
tar xzf brigade-station-<version>-linux-x64.tar.gz && cd brigade-station-<version>-linux-x64
sudo sh install.sh        # Linux; on a Mac, `sh install.sh`, without sudo
```

`install.sh` checks the machine first and writes nothing if it cannot cook (no `bwrap`, no `systemd`, no account to create): the refusal is one line with its reason. Then it creates the account, installs the version, links `current` and the `brigade` command, asks for the tokens once (the GitHub token and the Claude long-lived token; an unattended install gives them as `BRIGADE_GITHUB_TOKEN` and `BRIGADE_CLAUDE_TOKEN`), and starts the services. Run twice, it changes nothing.

## The layout

| | Linux | Mac |
|---|---|---|
| Installed versions | `/opt/brigade-station/<version>/`, `current` pointing at the live one | same |
| The command | `/usr/local/bin/brigade` → `/opt/brigade-station/current/bin/brigade` | same |
| The station's state (config, projects, clones, `status.json`) | `/var/lib/brigade/` | `/Library/Application Support/brigade/` |
| Tokens and secrets | `/etc/brigade/` (hidden from the cooks) | in the station's state, hidden from the cooks |
| The update's state (`etat.json`) | `/var/lib/brigade-station/` | same |
| Services | systemd: `brigade-station.service`, `brigade-station-porte.service`, `brigade-station-mise-a-jour.service` and its timer | launchd: `com.brigade.station`, `com.brigade.station.gate`, `com.brigade.station-update` |
| Log | the system journal | `/var/log/brigade-station.log` |

Which projects a station serves is one line each in `<state>/kitchen/projects`. Adding or removing one writes that line and nothing else: `brigade project add` and `brigade project remove`.

## The `brigade` account

The station runs as the system user `brigade`, with its own home: it holds the Claude login the cooks use, and owns the station's state. Operators never need to become that user: every subcommand below runs as you and reads only what the station publishes for operators (`status.json`, the update's `etat.json`, the service manager); the ones that change the machine go through `sudo` themselves.

## The network gate

The station's service reaches nothing but the loopback. Its only way out is `brigade-station-porte.service`, a gate per project that lets through that project's allow-list (Anthropic, GitHub, what the repository declares in `.claude/brigade/reseau`) and logs each refusal in the project's log. A cook never sees the network beyond its project's gate; a station whose gate does not open cooks nothing. See [runtime/isolation-and-network-filter.md](runtime/isolation-and-network-filter.md).

## The self-update

`brigade-station-mise-a-jour.timer` runs the update pass two minutes after the station starts, then ten minutes after each pass. A pass reads the published `station-<version>` releases and, if one is newer, installs it, switches `current`, and restarts the station — the cooks in flight finish. If the station does not come back on the new version, the previous one is put back. What each pass found is in the update's `etat.json`; `gel=oui` in the station's settings freezes the version. `brigade update --check` says what the next pass would do; `brigade update` runs one now.

## The `brigade` command

Every subcommand works the same on a server and on a Mac, locally or through ssh: `ssh <host> brigade status`. `brigade` alone, or `brigade help`, prints this list.

| Command | What it does |
|---|---|
| `brigade status [--json]` | the station's state: version, service, projects, cooks, update, quota, disk |
| `brigade logs [--since 1h] [<project>]` | the station's journal, from the last hour (or any `30m`, `2h`, `1d`), of one project |
| `brigade restart` | restarts the station (sudo); the cooks in flight finish |
| `brigade project add <name> <owner/repo> [--places N]` | serves a project: adds its line to `<station>/kitchen/projects` |
| `brigade project remove <name>` | stops serving a project: removes its line |
| `brigade update [--check]` | runs an update pass now (sudo), or says what it would do |
| `brigade uninstall [--purge]` | removes the services, the account, the installed versions and the command (sudo); keeps the station's state unless `--purge` |

The second runs `brigade status`, `brigade logs`, `brigade restart` and `brigade update --check` on a station, and nothing else: no journal read by hand, no service named, no counter read over `ssh`.
