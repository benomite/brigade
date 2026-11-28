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
| **Your Claude Max subscription** | for the Max connection, by hand, only once: a link to open in your browser, a code to copy back. |

## 1. The command

On the server, paste:

```sh
curl -fsSL https://github.com/benomite/brigade/releases/download/station/installer-station.sh | sh
```

That is all: it is the same command on a Mac. Under an ordinary account, it runs its root steps
through `sudo`, which may ask your password; in a root session, it needs none. Without `curl`, the
same with `wget -qO-` in place of `curl -fsSL`. (`… | sudo sh` works too.)

The command downloads the `brigade-station` package of the latest published version, hands it to
`apt` — which installs what it depends on (`git`, `gh`, `bubblewrap`…) —, waits for the station
to start, then does the **GitHub connection** (step 2); the **Max connection** is done by hand (step 2). Allow one to two
minutes, plus the time to log in. Nothing is left to edit by hand afterwards: no drop-in, no
environment file.

## 2. What you should see

The command shows the service's state, then two lines:

```
● brigade-station.service - brigade — la station de cette machine (tous ses projets)
     Loaded: loaded (…/brigade-station.service; enabled; …)
     Active: active (running) since …

brigade : station installée et active — <version>
brigade : tout ce qu'elle demande au système vient avec son paquet : sa vie courante ne demande aucune commande root
```

**`active (running)`: the station is installed.** It runs the kitchen (`runtime/src/kitchen/main.ts`), it
will restart with the machine, and it waits for its projects: one line each in
`/var/lib/brigade/kitchen/projects` ([`runtime/README.md`](runtime/README.md#declaring-a-project)).

### The GitHub connection

The command first connects the station's `brigade` account to GitHub: `gh auth login --web`, under
that account. `gh` shows a one-time code and the address `https://github.com/login/device`: open it
in your browser (on any machine), type the code, and authorize. Then `gh auth setup-git`, so that
`git` reads and pushes through it. Already connected — a rerun —, it is not redone.

### The Max connection

The command no longer does the Max connection: do it by hand, once, under the station's account:

```sh
sudo -u brigade -H claude setup-token
```

`claude` shows a link: open it in your browser, log in with your Max subscription account, authorize
Claude Code, and paste the code it gives into the terminal. It prints a long-lived token: store it
for the station, alone in the file, and tell the unit where it is:

```sh
sudo install -d -m 755 /etc/brigade
sudo install -m 600 -o brigade /dev/stdin /etc/brigade/claude-token      # paste the token, then Ctrl-D
echo BRIGADE_CLAUDE_TOKEN_FILE=/etc/brigade/claude-token | sudo tee /etc/brigade/jeton.env
sudo systemctl restart brigade-station
```

**If the GitHub connection fails** (`brigade : la station est installée, mais sa connexion GitHub
n'est pas faite`), the line above it says why: rerun the same command. It reinstalls nothing and
leaves the station running. **If the command had no terminal** (run from a script), it says so, and
stops before the connection: rerun it from a terminal on the server.

If the command stops on `brigade : installation refusée — …`, the line says why: the
machine is not a Debian, its architecture has no package, the download failed, or
`apt` refused (its output is just above). Nothing is left half-installed that `apt` cannot
resume: fix what it says, and rerun the same command.

## 3. What the installation put in place

- **The `brigade-station` service**: a single one for the whole machine, whatever the number of
  projects. Adding or removing a project will touch no system file.
- **The `brigade` account**, under which the station and its cooks run. It is the one that does the
  Max connection.
- **`/var/lib/brigade`**, where the station will keep the configuration, the log and the clone of
  each of its projects.

And nothing else: no `sudo` rule. Everything comes from the package, and follows it: when the station
moves to a new version, its unit and its rights move with it.

## 4. Reviewing the station, later

Without root, from any account on the server:

```sh
systemctl status brigade-station
```

`active (running)` means it is running. The last lines of its log only appear there
if your account reads the system journal; otherwise, the app will show them to you.

## 5. Updating

The station does not update itself: to move to a newer version, rerun the step 1 command. It hands the
latest package to `apt`, whose `postinst` restarts the station. **The cooks in flight are not cut**
(#4401): each runs under a relay that outlives the station, and the station that comes back up follows
them to their end and finishes their tickets.
