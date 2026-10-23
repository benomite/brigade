# Tutorial: install brigade on a Linux box

This tutorial takes a clean Linux server to a running **brigade station**: the service that
will make the **cooks** work on your **rail** once you add a project. It is the V2 product only,
from the repository [benomite/brigade](https://github.com/benomite/brigade). The words (chef,
second, cook, kitchen, rail, pass) are those of [`docs/glossary.md`](../glossary.md).

You are the **chef**: you decide, the kitchen cooks. The station is the part that lives on the
box. It is installed **once per machine**; projects are added to it afterwards.

## Prerequisites

| | |
|---|---|
| **A Debian-family server** | Debian 12 or newer (Ubuntu included), `amd64` or `arm64`, with systemd running — a real machine or VM, not a container. Check: `. /etc/os-release && echo "$PRETTY_NAME"`, `dpkg --print-architecture`, `ls -d /run/systemd/system`. |
| **Root access, once** | `sudo` or a root session. Only the installation needs it. |
| **The network** | the box reaches GitHub and its distribution's package repositories. |
| **A local disk for `/var/lib`** | `df -T /var/lib` must show neither `nfs` nor `cifs`. |
| **A Claude Max subscription** | the cooks run on your Max quota, through a connection made once at the end of step 1. An API key does not fit. |
| **A browser, on any machine** | to open the Max login link. |

You do not need a GitHub account for this tutorial: it comes when you add a project (see
"Where to go next").

## 1. Run the installer

On the box, in a terminal (the Max connection at the end needs one):

```sh
curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sudo sh
```

Without `curl`, use `wget -qO-` in place of `curl -fsSL`. In a root session, drop `sudo`.

**Expected result.** The command prints, in order:

```
brigade : téléchargement du paquet — https://github.com/benomite/brigade/releases/latest/download/brigade-station_<arch>.deb
brigade : installation du paquet et de ses dépendances
```

then the `apt` output, which installs the package and its dependencies (`git`, `gh`,
`bubblewrap`…), creates the `brigade` account and starts the service. It allows one to two
minutes. When the station is up, the command prints the service state, then:

```
● brigade-station.service - brigade — la station de cette machine (tous ses projets)
     Loaded: loaded (…/brigade-station.service; enabled; …)
     Active: active (running) since …

brigade : station installée et active — <version>
brigade : tout ce qu'elle demande au système vient avec son paquet : sa vie courante ne demande aucune commande root
```

The messages of the installer are in French, and are quoted as they appear.

If it stops on `brigade : installation refusée — …`, that line says why (not Debian-family, no
systemd, unsupported architecture, download failed, `apt` refused). Fix it and rerun the same
command.

## 2. Connect the station to your Claude Max subscription

There is nothing new to type: this is the last part of the command of step 1, which goes on by
itself and asks you for the only thing it will ever ask:

```
brigade : la connexion Max du compte brigade — le seul moment où elle te demande quelque chose
connexion Max — `claude setup-token` va te donner un lien : ouvre-le, connecte-toi avec ton compte Claude Max, puis recopie ici le code qu'il affiche. Il ne se fait qu'une fois
```

1. `claude` shows a link. Open it in your browser, on any machine.
2. Log in with your Max account and authorize Claude Code.
3. The page shows a code: paste it into the box's terminal.

**Expected result:**

```
connexion Max faite : le jeton est rangé, lisible du seul compte de la station, avec sa date de création à côté — la station n'a plus à se reconnecter
```

The token is never displayed. If the connection fails, the line says why: rerun the command of
step 1, which reinstalls nothing and does not redo a token already stored. If the command ran
with no terminal (from a script), it stops before this step and says so: rerun it from a
terminal on the box.

## 3. Check that the station runs

From any account on the box:

```sh
systemctl status brigade-station
```

**Expected result:** `Active: active (running)`.

Check the token is stored and readable by the station's account alone:

```sh
stat -c '%a %U' /etc/brigade/claude-token
```

**Expected result:** `600 brigade`.

Check the station's start line (needs a user who reads the system journal, e.g. through `sudo`):

```sh
sudo journalctl -u brigade-station --no-pager | grep 'station démarrée'
```

**Expected result:** a line such as `brigade : station démarrée — pid …, configuration /var/lib/brigade/projets ; aucun projet servi`.

## What you get at the end

- **The `brigade-station` service**, one for the whole machine, enabled at boot and running
  (`systemctl status brigade-station`). It is the process that serves projects: it takes tickets
  off each project's rail, runs a cook on each, and sends the result to the pass.
- **The `brigade` account**, under which the station and its cooks run, and which holds the Max
  connection.
- **The Max connection token** in `/etc/brigade/claude-token` (`600`, owned by `brigade`), with
  its creation date beside it. It lives a year, and the station warns you thirty days before.
- **`/var/lib/brigade`**, where the station keeps its configuration, the log and the clone of
  each project. For now it serves **no project**.

**How to check it, any time:** `systemctl status brigade-station` shows `active (running)`, and
the line `aucun projet servi` in its log says it is waiting for a project.

## Where to go next

The station serves nothing until you add a project. That part, and what the kitchen does once a
project is served, is documented in the repository:

- [`docs/installation-station.md`](../installation-station.md) — the same installation in full:
  token renewal, revocation, freezing updates.
- [`docs/installer.md`](../installer.md) — declaring a project on the box and serving its first
  ticket.
- [`docs/runtime/README.md`](../runtime/README.md) — how the kitchen works.
- The repository: <https://github.com/benomite/brigade>.
