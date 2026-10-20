# Install brigade

**This document is enough to install brigade on a new server and serve a first project on it** —
for someone who has never installed brigade, with nothing to piece together from another document.
What the runtime does once it is running is in [`runtime/`](runtime/README.md): go there to
understand, never to install.

**You install brigade in a project; you do not add a project to brigade.** The runtime is per
project, and brigade keeps no list of projects: what belongs to the project lives **in its
repository**, what belongs to the machine lives **on the machine**, and nothing about a project is
written in brigade's code or configuration. A project where brigade is installed stays
self-contained — you uninstall it without breaking anything (see "Uninstall").

The **box** is, everywhere here, the server that serves the project.

## Before you start

Three things are **yours**, and you need them before the first action. Brigade provides none of
them, and **nothing is shared with another brigade installation** — no account, no quota, no
organization, no machine. The only link with it is the code, a public repository that the box
clones.

| What you need | Why | What does not fit |
|---|---|---|
| **Your Claude Max subscription** | every cook, every manager judgment and every review runs on the Max session logged in on the box: your quota is what gets consumed | an API key: the runtime refuses to start if it finds one in its environment |
| **Your GitHub**: the project's repository, which you **administer**, and an account that **pushes and merges** there — your own, or a machine account you create | brigade reads the repository's issues, pushes branches to it, opens and merges PRs there; protecting the integration branch is an administrator action | a repository where you are only a contributor |
| **Your server**: Linux with systemd, where you have `sudo`, reachable by `ssh` **with a key**, with `/var/lib` on a local disk (`df -T /var/lib` shows neither `nfs` nor `cifs`) | the runtime is a systemd unit, and its lock needs a local disk | a container without systemd; a machine that has access to your production — the box has none, and asks for none |

And, for the first step only, a dev workstation with Claude Code and the brigade plugin.

The package commands are those of Debian and Ubuntu; the 2026-10-09 acceptance run was played on a
bare Debian 12. **As written here, this path has not yet been played end to end on a new
server**: what remains to be proven is at the end, "What only a real box will prove".

## The path: ten steps

A **step** is a block to paste, a session to open or a command to run — in one place, for one
thing. None of them opens an editor.

| | Step | Where | Replayed |
|---|---|---|---|
| 1 | Bootstrap the repository — `/brigade:init`, merged | the repository, on a dev workstation | per project |
| 2 | Reach the box — a check | your machine | per machine that reads |
| 3 | The service account and its tools | the box | per box |
| 4 | Its connections: Max, GitHub, git identity | the box, under the account | per box |
| 5 | Brigade: its code, its units, the box command and its group | the box | per box |
| 6 | Declare the project: its clone, its variables, its backup | the box | per project |
| 7 | Protect the integration branch | GitHub | per project |
| 8 | Verify, and create the labels | the box, then your machine | as often as you like |
| 9 | Measure the setup cost | the box | as often as you like |
| 10 | Start, and serve the first ticket | the box | per project |

A second project on the same box replays steps 1 and 6 to 10, and sets up what separates two
projects: "A second project on the box". An **additional** box, machine or human has its own step,
in "Add a box, a machine, a human". **Updating a box** is no longer done project by project: it
moves to the station, once, through its package — "Update brigade", under step 5, and
[`bascule.md`](bascule.md).

Steps 3 to 7 prepare; **step 8 tells you everything they missed, in one go** — it replaces a list
of points to check by hand.

## What lives where

| What | Where | Who reads it |
|---|---|---|
| Integration branch, file zones, local dev, gates cap | the bindings block of the repository's `CLAUDE.md` | the cooks, the gates |
| What "green" means | the repository's `.claude/brigade/gates.sh` | the pass |
| What makes a worktree runnable — dependencies, build, ports | the repository's `.claude/brigade/worktree-setup.sh` | the station, before each cook; the pass, before the gates |
| The rail's labels | the GitHub repository | the runtime, the chef |
| Brigade's code, its units | `/opt/brigade`, `/etc/systemd/system/` | systemd |
| The five variables | the `brigade@.service` unit and the **instance's** drop-in | the runtime |
| The reserved clone, the worktrees, the log | `/var/lib/brigade/<project>/` | the runtime |
| The Max session, logged-in `gh`, the git identity | the service account | the cooks, the runtime |

The runtime does not read the bindings: it reads its variables. The **integration branch** is
therefore written twice — in the bindings for the cooks, in `BRIGADE_BASE_BRANCH` for the station —
and the check refuses a mismatch.

## Per project: the path through the app

Once the box is prepared (steps 3 to 5, by hand, once per box), a project is put into service
**in the app, without copying anything by hand**: you add it (one screen), then its space carries
the guided installation, under **Settings**. The steps do not belong to the app: they belong to
the project's runtime (`installation etapes`), in a fixed order, **all shown before the first
action**; each says "What it is for" and "If you skip it", and the current one is marked "← now".
The state of each step is in the project's log: closing the app and reopening it finds the same
steps done.

**Adding** is done through `Add a project`: the project's folder, its name, its GitHub repository,
its box, the manager and reviewer calibration, where backups go, then `Install on the box, and
add`. The box clones, sets up the instance, the partition and the arbiter, and assigns the ports
(step 6). The app then offers `Open the space of “<name>” — its installation goes on there`.

**The seven steps**, in the app's order:

| | Step | What it is for | What the app does |
|---|---|---|---|
| 1 | **Add the project on the box** | make the project exist on the box | marked done as soon as the box answers for the project |
| 2 | **Bootstrap the repository** | `/brigade:init` sets up the bindings, the gates and the setup that the cooks read | `Run /brigade:init in the second` opens the session; you type it, you merge its PR, then `The result of /brigade:init is merged onto the integration branch` — the app cannot tell whether it is done |
| 3 | **Verify the box** | tells you everything that is missing in one go (step 8) | `Verify` runs `installation` on the box, and shows everything, word for word; it starts by itself when an unfinished installation is opened |
| 4 | **Declare the stations** | choose where tickets are served and how many cooks at a time — your quota, no default | one line per station the box provides, a number of cooks, then `Declare the stations`: recorded in the log, with no `sudo` and no drop-in |
| 5 | **Protect the integration branch** | PR required, administrators included, and push protection (step 7) | `Protect the integration branch` (`Record the protection` if it is already set); a protection you set up another way is not overwritten |
| 6 | **Settle the decisions the start requires** | manager and reviewer calibration, cost thresholds, closer | one decision at a time: its question, its options, its recommendation; `Answer`, or `Skip the optional decisions — the start does not require them` for those the start does not require |
| 7 | **Start the kitchen** | start the project's runtime: it sends a cook to the first ready ticket | `Start`: the box rechecks everything and marks the installation finished only if it is green, then the app writes the service start in a shell, **without sending it** — your Enter, and your `sudo` password if the box wants one |

**What the app does not do for you** is announced at the top, before any button: the
`/brigade:init` conversation and the merge of its PR, what "Verify" says is missing **on the box
itself** (with its command, word for word), and the service start, a `root` action. The only
terminal command left outside these three cases: **upgrading the box command**.

**The only upgrade command.** When the box has a command (`brigade-installer`) that is missing or
older than the one the runtime requires, the app can launch nothing through it: "Verify" files it
under "Verify the box" and states it, with its command:

```bash
sudo git -C /opt/brigade pull --ff-only
```

It updates the clone, and so the command linked to it; if the command was copied rather than
linked, the command that "Verify" names is `sudo install -m 755 /opt/brigade/runtime/deploy/<command> <link>`.
The reason: a box command is a `root` file that the service account runs through `sudo` — neither
the app nor the runtime can replace it without a password. Once it has been run, "Verify" starts
again and the installation resumes where it was. The detail is in "The installer command".

**The detail of each screen** — its refusals, its messages — is in [`app.md`](app.md). And the
acceptance run that plays this path end to end, for a second project on the box, is
[`recette/second-projet.md`](recette/second-projet.md).

**Manual fallback path.** The sections that follow do the same steps by hand, without the app.
They are only for when the app cannot do it — a box prepared without the installer command ("The
installer command"), a workstation without the app — or if you want to see what it plays. The path
through the app is the normal one; do not replace it with this one without a reason.

## 1. Bootstrap the repository

*Step 1.* In the project's repository, on a dev workstation, with the brigade plugin:

```
/brigade:init
```

This is the V1 path, and V2 does not invent a second one: `init` sets up the bindings block,
writes the two scripts, **proves** them on a throwaway worktree, and can be replayed harmlessly.
Then **merge the result onto the integration branch**: the runtime only sees what the branch
carries on the origin.

What V2 expects from each:

| File | Contract | If missing |
|---|---|---|
| `CLAUDE.md`, "## Équipe multi-agents" block | **Integration branch** equal to `BRIGADE_BASE_BRANCH` (if absent, it is `main`). **File zones**, **Local dev**, **Gates cap**: for the cook and the gates | block absent or branch different: **not ready**. One of the other three lines: reported, nothing is held back |
| `.claude/brigade/gates.sh` | executable; `gates.sh <worktree>`, **the exit code is the verdict** | **not ready** — the pass would send every delivery back (`unjudged`, cause `no-gates`) |
| `.claude/brigade/worktree-setup.sh` | executable; `worktree-setup.sh <n> <worktree>`, prints only `export` lines on its output | reported: the cook starts in a fresh worktree as it is, without dependencies |

Three things to know when writing the setup of a real project — a build, dependencies, a service:

- **It is played once per cook**, and once more by the pass before the gates. On a repository that
  installs and compiles, it is the entry cost of every ticket: step 9 measures it.
- **Ports are derived from the number received**, never hard-coded: several cooks run at the same
  time on the same machine. Number `0` is the one of step 9's probe, never of a ticket.
- **It leaves nothing running**: a service the cook needs is started from the cook or from the
  gates. And no `BRIGADE_*` variable of the runtime reaches it.

### Auto mode: what the project allows, and what it cannot

In auto mode, Claude Code's classifier judges every action. It refused the second some actions
that its role provides for — reading the queue or brigade's doc on the box (`[Exfil Scouting]`),
merging the `/brigade:init` PR at the chef's request (`[Merge Without Review]`). So `/brigade:init`
sets up, in the project's `.claude/settings.json`, the rules that allow what the roles provide
for, **and nothing else**. They come from the runtime, which computes them from each role's list
of actions (the "Gestes prévus" section of `commands/<role>.md`):

```bash
node <brigade clone>/runtime/src/mode-auto-cli.ts <project folder> [--hote <host>] [--nom <name>]
```

The host and the name are read from `~/.config/brigade/app.json`, at the project for that folder.
The command only adds the rules that are missing to `permissions.allow`, removes nothing — neither
the other keys nor the chef's rules — and can be replayed harmlessly. It is not a command of the
box command: it writes on the workstation, in the folder you name. What it set up can be read with
`cat .claude/settings.json` or `git diff`.

| What the configuration does | For which actions |
|---|---|
| **An exact rule**, without `*`: the command to the character | reading the queue (`ssh -o BatchMode=yes -o ConnectTimeout=10 -- <host> brigade <name> status`); reading the state (`… brigade <name> <rail\|log\|pass\|station\|base\|installation\|guardrails\|partition\|measures\|facts>`, without argument); reading the doc (`… -- <host> cat /opt/brigade/docs/<installer\|runtime\|app\|glossary>.md`); reading `~/.config/brigade/app.json` |
| **Nothing**: auto mode already lets them through, and a rule with `*` would widen them | the actions in the session's repository: worktrees, gates, `git`, pushing its branch, opening a PR, issues, notifications |
| **Nothing can**: the classifier stays sovereign | **putting a ticket on hold** (`waiting set`, free arguments); **merging a PR** — at the chef's request for the second, green for the manager: a rule sees neither the request nor the PR, you would have to allow `gh pr merge *`; **launching an agent**: Claude Code discards any `Agent` rule in auto mode; **pushing previews** to Claude Design: a `DesignSync` rule would allow any upload |

The command prints, action by action, which of the three lines it falls in. For an action nothing
can allow, the roles' **explained refusal** takes over: the role says in one sentence what it
wanted to do, why it is blocked, and the action to take — for a merge, `! gh pr merge <N> --squash`.
A chef's request that names the PR ("merge #372") is often what the classifier needs; nothing
guarantees it.

Four limits, which come from Claude Code and not from brigade:

- **The classifier's prose rules (`autoMode`) are not read from the repository** — neither
  `.claude/settings.json` nor `.claude/settings.local.json`: only from the user's or their
  organization's settings. Brigade writes none.
- **The `allow` entries of a `.claude/settings.json` only apply after the folder's trust
  dialog**. The file is merged with the rest of `/brigade:init`: that is how it reaches the
  project's other clones.
- **A rule recognizes a form, not a program**: a read written differently — without the `ssh`
  options, with an argument, between quotes — goes through the classifier. The roles write the
  exact forms.
- **The host is that of the workstation that ran `/brigade:init`.** Without a host declared for
  this project in the app, the box reads are not set up, and the output says so: rerun once the
  project is added. The host's name goes into a versioned file; a workstation that reaches the box
  under another name goes through the classifier.

## 2. Reach the box

*Step 2.* **The link between your machine and the box is `ssh`, and nothing else.** Everything
that reads or drives a project from your machine — you in a terminal, the app — runs `ssh <box>
brigade <project> <command>`. So there is **nothing to install on your machine**: what it already
has to open a terminal is enough. And it is always your machine that reaches the box, never the
reverse: no step puts a key from the box anywhere else, or opens a tunnel from it. The box has no
access to production, and reaching it gives you none.

`<box>` is, everywhere in this document, **what you pass to `ssh`**: `<your account>@<address>`,
or a name from your `~/.ssh/config`. It is the only thing that designates the box — the same value
is the project's `hote` field in the app ([`app.md`](app.md)).

**Box command, workstation command** (the convention is stated once, in
[`runtime/`](runtime/exploitation.md), "Driving"). In this document, a `brigade <project> …`
without `ssh` is typed **on the box**; from your machine, the same command is `ssh <box> brigade
<project> …`. Bare on your machine, `brigade` returns `command not found` — nothing is broken,
there is nothing to install there.

What you need, and nothing more:

| What | Where | How |
|---|---|---|
| An address your machine reaches | the box | a public address, `sshd` open **by key only** (`PasswordAuthentication no`) |
| An account **of yours** on the box, that carries your public key and **runs the command it is sent** | the box | on a new box, the one the provider creates with your key; otherwise "Add a human". An account locked into a session (`ForceCommand`) does not fit: `true` would not be run there |
| Your private key, in your agent if it has a passphrase | your machine | `ssh-add` — the app runs `ssh` without a terminal, it cannot ask you anything |

**A VPN is not a step.** Tailscale or WireGuard serve a box that has no reachable address: it is a
deployment option of that box, and it forces every reading machine to install it — which a managed
workstation may forbid. Behind a VPN, `<box>` is the address the tunnel gives; the rest of this
document does not change.

**The check**, from your machine. The exit code is the verdict:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <box> true; echo $?
```

| What you read | What it is | What to do |
|---|---|---|
| `0` | the box is reached, under your account, without asking you anything | go on to step 3 |
| `255`, `Could not resolve hostname`, `Connection timed out` or `Operation timed out` (depending on your machine) | the address: `ssh` did not find the machine | fix `<box>`, or open the `sshd` port |
| `255`, `Permission denied (publickey)` | the machine answers, your key is not there — or is not in your agent | `ssh-add -l` on your machine; on the box, "Add a human" |
| `255`, `Host key verification failed` | your machine does not know this box yet, and `BatchMode` forbids asking you | `ssh <box>` once, by hand, to accept its key |

`BatchMode=yes` is what the app passes: a connection that only succeeds by asking you something
succeeds in your terminal and fails in the app. This step only proves the link; that you can **run
a project's command** is checked at step 8, once there is one.

## 3. Prepare the box

Three steps, **once per box**, whatever the number of projects it will serve. Everything is played
on the box, under your account, which has `sudo` there.

`<account>` is the **service account**: a Unix account you create here, reserved for brigade,
under which the runtime and its cooks run. Its name is yours to choose.

### The service account and its tools

*Step 3.*

```bash
COMPTE=<account>
sudo useradd --create-home --shell /bin/bash "$COMPTE"
sudo apt install -y git curl libatomic1
# Claude Code, through its native installer, under the account — then a link where systemd finds it.
sudo -u "$COMPTE" -i sh -c 'curl -fsSL https://claude.ai/install.sh | bash'
sudo ln -sfn "/home/$COMPTE/.local/bin/claude" /usr/local/bin/claude
```

Two tools are installed their own way, **where systemd finds them** (`/usr/bin` or
`/usr/local/bin`): **Node 26** (nodejs.org) and **`gh`**, GitHub's command line (cli.github.com).
A tool placed elsewhere is made available through a link, like `claude` above: a unit does not
receive your shell's `PATH`, but `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin`.

The two lines that cannot be guessed are already in the block: `libatomic1`, without which Node 26
does not start on a bare Debian, and the `claude` link, without which no cook starts. If forgotten,
step 8 names them.

### Its connections

*Step 4.* A session under the service account — it is **the account** that logs in, not you:

```bash
sudo -u <account> -i
claude                    # then /login: your Max subscription. /exit afterwards
gh auth login             # your GitHub, over HTTPS — the account that pushes and merges on the repository
gh auth setup-git         # git pushes through it, without asking anything
git config --global user.name "<name>"
git config --global user.email "<address>"
exit
```

**No API key**: neither `ANTHROPIC_API_KEY` nor a `claude` token in the environment of this
account or of a unit — the runtime would refuse to start. If `claude` refuses to start
(`Temp directory … is owned by uid … Refusing to use it`), its temporary directory was created by
another account: `sudo chown -R <account> /tmp/claude-"$(id -u <account>)"`. The cooks do not run
into it: the unit has its own `/tmp`.

### Brigade: its code, its units, the box command and its group

*Step 5.*

```bash
COMPTE=<account>
TOI=<your account on the box>

# The code, and the units — copied as they are, all of them.
sudo git clone --branch v2 https://github.com/benomite/brigade.git /opt/brigade
sudo cp /opt/brigade/runtime/deploy/*.service /opt/brigade/runtime/deploy/*.timer /etc/systemd/system/
# The account they run under: the units do not share their settings.
for unite in brigade@ brigade-sauvegarde@ brigade-porte@ brigade-arbitre; do
  sudo install -d "/etc/systemd/system/$unite.service.d"
  printf '[Service]\nUser=%s\n' "$COMPTE" | sudo tee "/etc/systemd/system/$unite.service.d/compte.conf" >/dev/null
done
sudo systemctl daemon-reload

# The box command, and the group of humans allowed to run it.
sudo ln -s /opt/brigade/runtime/deploy/brigade /usr/local/bin/brigade
sudo groupadd brigade-chefs
sudo usermod -aG brigade-chefs "$TOI"
echo "%brigade-chefs ALL=($COMPTE) NOPASSWD: /usr/local/bin/brigade" | sudo tee /etc/sudoers.d/brigade >/dev/null
sudo chmod 440 /etc/sudoers.d/brigade
sudo visudo -cf /etc/sudoers.d/brigade      # "parsed OK"
```

What this block set up:

- **Brigade's code**, in `/opt/brigade`. It is a public repository; it carries nothing of your
  project, and the runtime never writes there. It has nothing to install or compile.
- **The units**, once and for all: the runtime's (`brigade@.service`, one instance per project),
  its backup, and those only needed from a second project on (the partition's door, the arbiter).
  A unit that is copied and never started does nothing.
- **The box command**: `brigade <project> <command>` runs a runtime command for a project, under
  the service account and with its unit's environment. It is a link, not a copy: updating the
  clone updates it.
- **The `brigade-chefs` group and its rule**, which only names the command. The command goes
  through to the service account by `sudo`, and an `ssh` without a terminal cannot type a
  password: the right to run it is the group's. Your membership applies **at your next login** —
  log out and back in.

**What this rule gives** every member of the group: all the commands of the box command, for all
the box's projects — the `merge` grant, the "stop", `installation uninstall`, `restore`
included. Reading and acting are not separated (V2.5). It gives neither a shell under the service
account, nor the execution of a file of one's choice: the box command only runs the `src/` files
that the runtime's `package.json` names, with the given arguments. One more human is one more
account in this group, never one more rule ("Add a human").

### The installer command

*Optional, once per box — to add a project **from the app**.* It is not a step of the path:
without it, a project is declared by hand (step 6).

```bash
# The box's second command, and its own sudoers rule: it names only that command.
sudo ln -s /opt/brigade/runtime/deploy/brigade-installer /usr/local/bin/brigade-installer
sudo install -m 440 /opt/brigade/runtime/deploy/brigade-installer.sudoers /etc/sudoers.d/brigade-installer
sudo visudo -cf /etc/sudoers.d/brigade-installer      # "parsed OK"

# Its setting, owned by root: the root under which a backup destination is accepted.
# It has no default.
sudo install -d <backups root>
printf 'sauvegardes=<backups root>\n' | sudo tee /etc/brigade-installer.conf
```

`sudo brigade-installer install <project> …` does, as root and in one go, the "per project" part
of this document — the reserved clone, the drop-in, the backup, the partition and its door, the
arbiter's port — and **assigns the door's port itself**. It does not start the runtime. Its rule
gives it to the `brigade-chefs` group (step 5), without a password: the app launches it through
`ssh`, without a terminal, when you add a project in it ([`app.md`](app.md), "From the app"). What
it accepts, what it refuses, its exit codes and its log (`/var/lib/brigade-installer`, owned by
root) are described at the top of `runtime/deploy/brigade-installer`.

`brigade <project> installation` (step 8) rereads this setting: it states the file, the root it
declares, and that **root alone holds the path up to it** — the check the command makes at install
time, played before anyone tries it. An absent setting is only a "good to know" (a box that does
not serve an app does not need one); present and wrong, it is a gap, with who owns the directory
and the command that gives it back to root.

On **a box prepared before it**, first update brigade's clone (below, step 1), then play this
block. As long as it is not there, the app says so — `le geste d'installation n'y a pas répondu`
— and declares nothing.

### Update brigade

A box is no longer updated project by project: the commissioning command and each project's
switchover are removed. **It moves to the station, once**, by installing its package: the package
takes over its projects — log, decisions and tickets in progress left where they are — and removes
what that installation had set up (the `brigade@<project>` units, their drop-ins, the commands and
their sudoers rules). The procedure, and what is checked afterwards: [`bascule.md`](bascule.md).
After that, the station updates itself ([`installation-station.md`](installation-station.md),
"Updating, on its own").

Until then, the projects' code is the clone: `sudo git -C /opt/brigade pull --ff-only` updates it,
and a project picks it up at its next start (`sudo systemctl restart brigade@<project>.service`).
A unit that the check (step 8) reports as stale is recopied from the clone, then `sudo systemctl
daemon-reload`; it applies to the whole box.
## 4. Declare the project

*Manual fallback path.* Through the app, this step is "Add the project" in the per-project flow,
which does the same work (the clone, the drop-in, the backup, the partition, the arbiter); reading
it here tells you what it lays down, or lets you do it by hand if the app cannot.

Two steps, **once per project**. `<project>` is a short identifier you choose (lowercase letters,
digits, dashes): it names the instance, and nothing else ties it to the repository.

### Its clone, its variables, its backup

*Step 6.* On the box. The five values at the top are the only ones to fill in; the chef's
calibration comes after, through the step:

```bash
PROJET=<project>
DEPOT=<owner>/<repo>
BRANCHE=<integration branch>
COMPTE=<account>
SAUVEGARDES=<this project's backups directory>

# The reserved clone: nobody works in it, the station hangs the cooks' worktrees on it.
sudo install -d -o "$COMPTE" "/var/lib/brigade/$PROJET"
# The backups under their root: only the last level belongs to the account. A `-o` on
# the whole path would hand the account the root being created along the way — and the
# installation step would then refuse every project ("root creates nothing there").
[ -d "$(dirname "$SAUVEGARDES")" ] || sudo install -d "$(dirname "$SAUVEGARDES")"
sudo install -d -o "$COMPTE" "$SAUVEGARDES"
sudo -u "$COMPTE" git clone "https://github.com/$DEPOT.git" "/var/lib/brigade/$PROJET/depot"

# The instance's drop-in: it is what makes the project exist on the box.
sudo install -d "/etc/systemd/system/brigade@$PROJET.service.d" "/etc/systemd/system/brigade-sauvegarde@$PROJET.service.d"
sudo tee "/etc/systemd/system/brigade@$PROJET.service.d/projet.conf" >/dev/null <<EOF
[Service]
Environment=BRIGADE_GITHUB_REPO=$DEPOT
Environment=BRIGADE_BASE_BRANCH=$BRANCHE
EOF

# The log backup, every night at 03:30.
printf '[Service]\nEnvironment=BRIGADE_BACKUP_DIR=%s\n' "$SAUVEGARDES" | sudo tee "/etc/systemd/system/brigade-sauvegarde@$PROJET.service.d/projet.conf" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "brigade-sauvegarde@$PROJET.timer"
```

**Do not start the service yet**: check first (step 8).

**What the chef decides does not go in the drop-in.** The drop-in carries only the machine's
facts: the account, the path of `node`, the location of the clone, the ports. The stations, the
drift cost thresholds and the manager and reviewer calibration are decisions: they are set
**in the app**, at the "Declare the stations" and "Set the decisions that startup requires" steps
of the guided flow, in the project's log — never through a `sudo`, and without restarting
anything. The runtime assumes no station: without any it starts, and **no cook
launches**; the step 8 check counts that as a gap (`no station declared`). A decision variable
left in a drop-in from before this flow is never read again: only the one in the log counts, which
the app sets at those same steps.

The **five variables** without which the runtime refuses to start, and where each comes from:

| Variable | Set by |
|---|---|
| `BRIGADE_STATE_DIR`, `BRIGADE_PROJECT`, `BRIGADE_REPO_DIR` | the unit, from the instance name — nothing to write |
| `BRIGADE_GITHUB_REPO`, `BRIGADE_BASE_BRANCH` | the instance's drop-in |

**The backup destination** belongs to the project and is **outside `/var/lib/brigade/<project>`**
— on another disk if the machine has one. It has no default: the backup does not pick a disk
on its own. If missed (machine off at 03:30), it is played at the next startup; for a
different schedule, a timer drop-in with an empty `OnCalendar=` and then yours. Restoring is in
`docs/runtime/exploitation.md`, "Back up and restore".

Nothing else is needed to serve a project. What is **optional** is set later
in the same drop-in, and read in `docs/runtime/` (`exploitation.md`, `identites-et-secrets.md`) when you need it: the settings
("Five variables, no default"), the project's dev secrets ("The project's secrets"), one
GitHub identity per role for a shared repository ("What you create at GitHub").

### Protect the integration branch

*Step 7.* On GitHub, by you who administer the repository — from any machine where your
`gh` is logged in. PR required, zero approvals required, administrators included: nobody
pushes directly to the branch any more; PR merges go through.

```bash
DEPOT=<owner>/<repo>
BRANCHE=<integration branch>
gh api -X PUT "repos/$DEPOT/branches/$BRANCHE/protection" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
gh api "repos/$DEPOT/branches/$BRANCHE/protection" --jq '.required_pull_request_reviews, .enforce_admins.enabled'
# Push protection: the second barrier against a delivery that would carry credentials.
gh api -X PATCH "repos/$DEPOT" --input - <<'JSON'
{ "security_and_analysis": { "secret_scanning": { "status": "enabled" }, "secret_scanning_push_protection": { "status": "enabled" } } }
JSON
```

**Branch protection is the only one the runtime assumes.** "Require branches to be up to date" is
not required; if enabled, its refusal goes back to the cook as a finding (`pass.outdated`) and consumes
a send-back — any other refusal is a stop (`merge-refused`). It does not reserve the merge for the pass:
only an identity per role allows that.

**Push protection is not assumed**: step 8 says what GitHub returns for it. Free on a
**public** repository, it requires GitHub Secret Protection on a **private** one (Team and
Enterprise plans, of an organization) — without it there is only one barrier, the station's, which
sees only what passes through it. **Even when active**, it recognizes only the forms in its list (Anthropic
API keys, **not the login token of a Max subscription**), does not see a transformed copy, and anyone who writes to the repository can bypass it from the site — a cook cannot,
it has neither account nor browser. The day you believe the Max connection has leaked: `docs/runtime/station-cook.md`,
"Revoke the Max connection".

## 5. Check that the project is ready

*Step 8.* One command says whether a cook can launch, **and names everything that is missing at once** — not the
first gap. It launches no cook or setup, consumes no quota, writes nothing to GitHub
and reads the log read-only (for the Max connection, see below); in the reserved clone, it moves no reference. It can be replayed
as often as you like, service stopped or not.

It reads **the service's environment**, like the runtime: on the box, it is launched through the
`brigade <project> <command>` step, which gives it that environment. It knows a project only by its drop-in — the one
from step 6.

```
$ brigade boutique installation

On the machine
  ok        the 5 required variables are set, and everything the runtime reads from its environment is readable
  ok        reserved clone: /var/lib/brigade/boutique/depot, `main` read on origin (a1b2c3d)
  ok        Max session: `claude` is logged in under this account
  ok        service unit: brigade@boutique.service
  ok        units up to date: nothing laid down under /etc/systemd/system differs from the repository (/opt/brigade/runtime/deploy) — brigade-sauvegarde@.service, brigade-sauvegarde@.timer, brigade@.service

In the repository
  MISSING   `.claude/brigade/gates.sh` is not executable: the pass runs it as is
            → `git update-index --chmod=+x .claude/brigade/gates.sh`, committed on `main`
  ok        worktree setup: `.claude/brigade/worktree-setup.sh`
  ok        bindings: block present, integration branch `main`

On GitHub
  ok        repository read by `gh`: acme/boutique
  to know   GitHub push protection is not confirmed on acme/boutique (GitHub says: `disabled`): the station remains the only barrier against a delivery that would carry credentials
            → docs/installer.md, "Declare the project"
  MISSING   labels absent from the repository: fire, model:opus, model:sonnet, …
            → the same command, followed by `labels`

brigade: project "boutique": 2 gaps: no cook must be launched while any remain
```

| Mark | What it means | Exit code |
|---|---|---|
| `ok` | confirmed | |
| `MISSING` | a cook launched now would fail, or its delivery would not be judged. The step that fixes it follows the arrow | `1` as soon as there is one |
| `to know` | nothing is held back, but you must know: no setup, backup not scheduled, push protection not confirmed, binding the runtime does not read, **box to update** (outdated units) | |

With no `MISSING`, it exits `0` and says "ready".

What it checks:

| Where | What |
|---|---|
| Machine | the five variables, **all** those that are missing; each badly written setting, in the words the runtime would use to refuse to start; no `claude` key or token in the environment |
| Machine | the reserved clone exists, it is indeed the one of the designated repository, its origin answers under this account, and the integration branch exists in it |
| Machine | **`node` starts in the unit's environment, and it is the one the runtime requires** — the step says so before launching anything (code `70`) |
| Machine | the account has a git identity: a cook commits there |
| Machine | `claude` is logged in (`claude auth status`, no model call — a stored credential, not a proven session: if the log says the Max connection expired, **that** is what is missing, with its date, in the words of `run station`); the `brigade@<project>.service` unit is installed; the backup is scheduled |
| Machine | `claude` is in the `PATH` **that the unit will give the runtime** — that of its drop-ins, or systemd's default —, not that of the shell running the command; its temporary directory (`/tmp/claude-<uid>`, or under `CLAUDE_CODE_TMPDIR`) belongs to the account, if it exists |
| Machine | **the laid-down units are those of the clone** — otherwise the outdated ones are named, with their step ("Update brigade") |
| Repository | on the integration branch **as origin carries it**: gates and setup present and executable, bindings block, consistent integration branch |
| GitHub | `gh` reads the repository under this account, **and can push to it**; the rail's labels are there; what GitHub returns for push protection |

What it does **not** check: that the setup and the gates *succeed* (step 9 plays the setup;
the gates are proven by `/brigade:init`), the branch protection (step 7 rereads it
itself), the project's secrets, and, under an identity per role, the rights of each App. When
it cannot read the repository — clone absent, branch not found — it says so (`repository not checked`) instead of
declaring it good.

**The three traps of a new server are no longer discovered by stumbling on them** — they tripped
us once, at the 2026-10-09 acceptance run, on a bare Debian 12. The first two read like this; the
third has disappeared:

```
brigade: `node` does not start in the environment of brigade@boutique.service — node: error while loading shared libraries: libatomic.so.1: cannot open shared object file: No such file or directory
          → `sudo apt install libatomic1` (docs/installer.md, "Prepare the box")
```

```
  MISSING   `claude` not found in the `PATH` that the unit brigade@boutique.service will give the runtime (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin, systemd's default: no `Environment=PATH=` in its drop-ins): no cook would launch — the `PATH` of the shell running this command does not count
            → `sudo ln -sfn /home/<account>/.local/bin/claude /usr/local/bin/claude` — the native installer puts `claude` under the account's `~/.local/bin`, which systemd does not give the unit; docs/installer.md, "Prepare the box"
```

The first is reported by the step itself, which exits `70`: without `node`, the command can say
nothing. A `node` older than the one the runtime requires is refused the same way, with both
versions.

The third — a `/tmp/claude-<uid>` that does not belong to the account, where `claude` refuses to start —
no longer stops any cook: the unit has its own `/tmp`. It now only affects a `claude` launched
by hand under the account, the Max connection of step 4 included, and the command reports it as `to know`,
with its `chown`.

On a workstation without systemd, the unit is not checked — neither the `PATH` it would give, nor its
copies, nor the code the runtime runs on — and the command says so.

**Then the same command, from your machine** — this is what the app will do, and what the box cannot
check by itself. The exit code is the verdict:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <box> brigade <project> installation; echo $?
```

| What you read | What it is | The step |
|---|---|---|
| `0`, `1` or `2`, and the command's output | **the command was launched**: the link and the right are there. `1`: something is missing from the project, the output names it | — |
| `255` | `ssh` did not reach the box, or your key is refused there | step 2 |
| `68`, `brigade: "<you>" does not have the right to run the step on this box …` | you have an account on the box, not the right to the step | "Add a human" |
| `65`, `brigade: unknown project on this box …` | the project name, or its drop-in | step 6 |
| `69`, ``brigade: `sudo` is missing on this box …`` | the box has no `sudo`: the step cannot switch to the service account | install it on the box (`apt install sudo`, as `root`) |
| `70`, ``brigade: `node` does not start …`` or `` `node` is at … `` | Node is missing from the box, does not start, or is too old | what the sentence says; step 3 |
| `127`, `brigade: command not found` | the step is not laid down on the box | step 5 |
| anything other than the output of `installation` — a session screen, a prompt | your account on the box is locked into a forced command, which replaces the one you send | "Add a human", "A shell is not the right to read" |

### Create the labels

Still step 8 — it is the only gap the check fixes itself:

```bash
brigade <project> installation labels
```

Creates on the repository those that are missing among `fire`, `prio:1` to `prio:3`, `model:opus|sonnet|haiku`
and `effort:low|medium|high|xhigh|max`. **A label that exists is neither recreated nor touched** — its
color and description belong to the project — and the command can be replayed harmlessly. The labels of the
V1 protocol (`product`, `triage`, `feature`…) are laid down by `/brigade:init`; those the manager
reads if it finds them (`epic`, `question`, `decision`, `blocked-on-human`) are yours.

## 6. Measure the setup cost

*Step 9.* On brigade, the setup is an `npm ci` of two packages. On a real project it is an installation
and a build, **played once per cook** — and the cap on cooks is whatever your stations declare until
you set it live.

```bash
brigade <project> installation setup          # at all the cooks the declared stations run at once
brigade <project> installation setup 12       # at 12
```

It plays the setup **once, as a dry run**, as the station would play it before a cook: in a fresh
worktree of the integration branch, with a cook's environment, under half the lease.
No cook is launched; the worktree is removed afterwards. It passes the setup the number `0`.
**Play it before starting the service, or with the kitchen stopped** (`guardrails -- stop`): it pulls
the base and hangs a worktree in the reserved clone, two things the station also does, and the
measure of a setup taken in the middle of others is worthless.

```
brigade: setup played in 48.2 s on `main` (a1b2c3d) — once, alone, as a dry run, machine load 0.4 on 8 cores
  worktree    11.2 MB at creation, 412.6 MB once the setup has run
  cap         15 min, half the lease — beyond that the station stops the setup: holds
At 30 cooks, 4 entering at once (BRIGADE_MAX_SETUPS)
  entry       8 waves of setups: the last cook leaves 5.6 min after the first, at best — more if the machine saturates
  disk        12.1 GB for 30 worktrees, 61.3 GB available once the station's reserve is deducted: holds
brigade: a fresh worktree per cook holds at 30 cooks on this machine
```

**"Holds"** means two things, and only those: the setup finishes under half the
lease (beyond that, the station stops it and the ticket goes 86 `setup-failed`; twice in a row, and
no setup is launched any more until the integration branch moves), and all
the worktrees fit together on the disk, the station's reserve deducted
(`BRIGADE_MIN_FREE_DISK_MB`). Otherwise it exits `1` and says what to lower.

What the measure does not say, and must be read with it:

- It is taken **alone**. With four setups side by side, each takes longer; the station
  withholds itself when the machine saturates, but shortens nothing.
- The **entry** time is information, not a threshold: the last ticket waits on the rail,
  it does not fail.
- It weighs the worktree, not what the setup puts **elsewhere** (a test database, a package
  manager cache) — and does not remove it either.
- A build's memory is not measured.

A **failing** setup exits `1` with its last twenty lines: it is the same failure
the station would meet, without a lost cook. Brigade shares nothing between the worktrees
of two cooks: if the measure says it does not hold, lower the cap on cooks
(`brigade <project> station cooks <N>`) or lighten the setup — a shared cache would be a ticket.

## 7. Serve the first ticket — without a `merge` grant

*Step 10.* **A project's first ticket is served without a `merge` grant**: the pass opens the PR, judges it, and
stops. You do the merge. On brigade, a cook that gets it wrong breaks a rework branch;
on an active project, it breaks the branch others are working on.

There is nothing to disable: the grant is **absent** on a fresh state directory, and the manager
is **off**. Check it, then start.

```bash
sudo systemctl enable --now brigade@<projet>                  # starts, and restarts at every reboot
brigade <project> grant                                        # "ABSENT — never given"
sudo systemctl start brigade-sauvegarde@<project>.service      # a first backup, right now
```

Put `fire`, `model:haiku` and `effort:low` on a short issue. Follow it with
`brigade <project> status` and `brigade <project> pass`. Once the PR is open and green, reread it and merge it
yourself.

What the process prints is read with `journalctl -u brigade@<project> -f`; a refusal to start
(code 2) is not retried, and `systemctl status brigade@<project>` gives the reason. All the
step's commands, and updating brigade, are in `docs/runtime/exploitation.md`, "Drive".

**Enable the grant only after rereading at least one delivery from this project** — one command, no
restart (`brigade <project> grant enable merge`), preferably with an expiry (`--for 4h`,
`--uses 10`): it then switches off on its own, see "The `merge` grant" in [`runtime/`](runtime/pass-merge.md).

**Before granting, read the tally of stops for lack of a grant.** Each green delivery stopped says
on its issue what the pass would have merged; `pass` and `grant` count what you did with them —
merged, closed without merge (the disagreements), still open. That is the figure on
which to grant (`docs/runtime/pass.md`, "The reasons, and the step for each").

## A second project on the box

A second project replays steps 1 and 6 to 10 — nothing from "Prepare the box". **Two more things
are then laid down, for all the projects on the box**; their units are already copied. What
they do is in `docs/runtime/cloison-et-arbitre.md`, "The partition" and "The arbiter between projects".

### The partition

**Per project.** Without it, the box's projects see each other, files and secrets included, and their
cooks reach the whole Internet; the runtime says so at every startup. Lay it down before a second
project arrives with its secrets.

Check first, under the service account:

1. `bwrap` is installed (`sudo apt install bubblewrap`) and **launches without privilege**:
   `sudo -u <account> bwrap --ro-bind / / --dev /dev --proc /proc --unshare-pid true` says nothing.
   A `setting up uid map: Permission denied` refusal (AppArmor, recent Ubuntu) is a machine
   setting: `kernel.apparmor_restrict_unprivileged_userns`, or a profile for `bwrap`.
2. `env --default-signal=TERM true` says nothing (coreutils 8.32 at least): it is through it that a
   partitioned cook hears its stop signal.
3. `claude` is **not** installed under `~/.claude` (`readlink -f "$(command -v claude)"`), which
   the partition replaces with the project's. Under `~/.local`, where step 3 puts it, a cook
   reads it without being able to write to it.
4. The project's secrets and keys are under `/etc/brigade/<project>/`, its state under
   `/var/lib/brigade/<project>/` — these are the two masked directories.
5. **The repository declares its package registries** in `.claude/brigade/reseau` (one host per line,
   merged on the integration branch): none is open by default, and a setup that installs
   packages would fail. **Nothing to write by hand**: `/brigade:init` proposes it, deduced from the
   install line of the `worktree-setup.sh` it has just written, with the explanation at the top — and an
   empty commented file when it has nothing to open or could not translate the tool. It counts only once
   merged with the rest of the init result (step 3). A declaration merged afterwards is read when the next ticket is taken,
   before its setup — nothing to restart, no ticket lost. `brigade <project> partition` shows the
   list read.

```bash
PROJET=<project>
PORT=<door port>     # one per project, no default
sudo cp /opt/brigade/runtime/deploy/cloison.conf "/etc/systemd/system/brigade@$PROJET.service.d/"
sudo install -d "/etc/systemd/system/brigade-porte@$PROJET.service.d"
# The same port on both sides: the door opens it, the runtime goes out through it.
printf '[Service]\nEnvironment=BRIGADE_PROXY_PORT=%s\n' "$PORT" | sudo tee "/etc/systemd/system/brigade@$PROJET.service.d/porte.conf" "/etc/systemd/system/brigade-porte@$PROJET.service.d/porte.conf" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "brigade-porte@$PROJET"
sudo systemctl restart "brigade@$PROJET"
```

The service account becomes read-only for its launches, except for the caches: **a project's
tools (pnpm, npm, yarn, pip…) write their cache at their usual place under `~`
(`~/.cache`, `~/.npm`, `~/.local/share`, `~/.local/state`), with nothing to set, and it lands in
`/var/lib/brigade/<project>/compte`, which the project's tickets pass to each other and which no other project
sees** — jest, for its part, writes to `/tmp`, the project's own. A toolchain that writes elsewhere
under `~` is named in `BRIGADE_SANDBOX_PRIVATE`, and what the account keeps and a cook has no
need to read (`/home/<account>/.ssh`) is added to `BRIGADE_SANDBOX_HIDDEN` — both in the
copied `cloison.conf`. Before launching a cook: `journalctl -u brigade@<project>` shows the lines
`cloison —` and `réseau —`, the second saying that **a direct send is refused by the kernel**; then
`brigade <project> partition probe`, each probe of which must hold.

### The arbiter

**One per box.** Without it, each project takes itself to be alone on the machine and on the Max account:
their cook caps add up, and nothing says who goes first.

```bash
PORT=<arbiter port>
COOKS=<account's cook cap, all projects combined>     # neither has a default
sudo install -d /etc/systemd/system/brigade-arbitre.service.d
printf '[Service]\nEnvironment=BRIGADE_ARBITER_PORT=%s\nEnvironment=BRIGADE_ARBITER_MAX_COOKS=%s\n' "$PORT" "$COOKS" | sudo tee /etc/systemd/system/brigade-arbitre.service.d/arbitre.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now brigade-arbitre.service
# Then, for EACH project on the box, the same port — it is through it that its runtime reaches the arbiter:
for PROJET in <project> <project>; do
  printf '[Service]\nEnvironment=BRIGADE_ARBITER_PORT=%s\n' "$PORT" | sudo tee "/etc/systemd/system/brigade@$PROJET.service.d/arbitre.conf" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl restart 'brigade@*'
```

`journalctl -u brigade@<project>` says `arbitre — 127.0.0.1:<port>, consulted before each
launch`. A project whose drop-in lacks the port is neither arbitrated nor counted: it launches as
if it were alone. **Stopping the arbiter freezes no one**: each project goes into degraded mode, one
cook at a time.

## Add a box, a machine, a human

None of the three replays a project's installation, and none touches the other two.

| One more | The step | Where | What is to be redone, and why |
|---|---|---|---|
| **A box** | prepare it (steps 3 to 5), then give its address | the box; the app | the group and its `sudoers` rule, **once per box**; one account **per human and per box** — a machine's accounts and rules are not shared with another |
| **A machine** that reads | have a key there, and put it on your account on the box | the machine; the box | nothing per project, nothing per box beyond the key |
| **A human** | create them an account in the group, with their public key | the box | nothing per project: the right is the group's |

### Add a human

**A human is a Unix account of their own on the box, with their public key, in the group
`brigade-chefs`.** No shared account, no common key, no secret to pass around: they
send you their **public** key, you do the rest. The step is played on the box, by someone who has
`sudo` there — not necessarily the one who installed it.

```bash
sudo useradd --create-home --shell /bin/bash --groups brigade-chefs <human>
sudo install -d -m 700 -o <human> /home/<human>/.ssh
sudo install -m 600 -o <human> <their public key>.pub /home/<human>/.ssh/authorized_keys
```

If they already have an account **without a forced command** on the box, only group membership is missing:
`sudo usermod -aG brigade-chefs <human>`.

The group and the rule that gives it the step already exist: they are laid down **once per box**,
with the step itself (step 5). Add a human rewrites no rule and
touches no project.

**What you give them, spelled out.** The group's right is the `brigade` step, whole:
**all its commands (`docs/runtime/exploitation.md`, "Drive"), for all the box's projects** — reading `status`, but
also granting the `merge` grant, saying "stop", uninstalling a project. **Reading and acting are not
separated**: dosing rights per human does not exist yet (V2.5). It is of the same order as giving
them a shell on the box, and they have one, under their account. What they do not have: a shell under the
service account, the Max session, and — like you, like the box — access to prod.

**The check**, from **their** machine, with their account in `<box>`:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <human>@<address> brigade <project> status; echo $?
```

`0` and the output of `status`: it is done. Any other result is read in the step 8
table — `255`, their key; `68`, the group (`id <human>` on the box must name `brigade-chefs`).

**A shell is not the right to read.** The two are given separately, and one says nothing about the
other:

- An account on the box that is not in `brigade-chefs` opens a shell and is refused the step
  (code `68`).
- An account locked in by an `sshd` `ForceCommand` — a `tmux` session, a container — gives a
  session to a human and **cannot run any command**: the one sent to it is replaced
  by its own. The app will never read anything through it, group or not. That account stays what it is;
  the human gets a second one, through the step above. To find out, on the box:

  ```bash
  sudo sshd -T -C user=<human>,host=localhost,addr=127.0.0.1 | grep -i forcecommand   # "forcecommand none"
  ```

**Removing them**: `sudo gpasswd -d <human> brigade-chefs` removes the step from them and leaves them their
account; `sudo userdel -r <human>` removes the account. No other human is touched.

### Add a machine

One more machine — yours, or that of a human already added — **installs nothing**: it has
`ssh`, it needs a key that your account on the box knows.

```bash
ssh-keygen -t ed25519                # on the new machine, if it has no key
ssh <box> 'cat >> ~/.ssh/authorized_keys' < <the new machine's public key>.pub   # from a machine that already has access
```

Then the step 2 check, from the new machine. One key per machine: removing one
means removing its line from `~/.ssh/authorized_keys` on the box.

### Add a box

One more box is prepared like the first — steps 3 to 5, then 6 to 10 per project. **Two
things are replayed there for the humans, and not one more**: the `brigade-chefs` group and its rule
(once, in step 5), and each human's account ("Add a human"). They live in each machine's `/etc`: nothing in brigade copies them from one box to
another, and a box knows nothing of the others.

On the reader's side, one more box is **an address**: `<box>` for `ssh`, the project's `hote` field
in the app. Nothing else designates it.

## Uninstall

**Through the app, in two distinct steps, never to be confused** ("Remove a project: from
the app, or from its box", in [`app.md`](app.md)):

1. **Remove from the app** — one click. Nothing is sent to the box: the project stays installed there, and its
   log too. Only the project's line leaves the bar.
2. **Uninstall from the box** — the app first shows the plan the box returns (what would be removed,
   what is kept), then you type the project name to confirm. **The log survives by default**:
   the box that deletes it is unchecked by default, and is sent only if you check it.

The manual path, below, does the same by hand on the box: it is the fallback.

In order. Nothing here touches the repository.

```bash
sudo systemctl disable --now brigade@<project>.service brigade-sauvegarde@<project>.timer brigade-porte@<project>.service   # stops the runtime and its cooks, the backup, the door
brigade <project> installation uninstall             # says what would be removed, removes nothing
brigade <project> installation uninstall --confirm   # removes the reserved clone and the worktrees
sudo rm -rf /etc/systemd/system/brigade@<project>.service.d /etc/systemd/system/brigade-sauvegarde@<project>.service.d /etc/systemd/system/brigade-porte@<project>.service.d
sudo rm -rf /opt/brigade-versions/<project>               # the runtime versions an earlier switch laid down for it, if any
sudo systemctl daemon-reload
```

**The same step for all projects.** `brigade-porte@<project>` exists only **with the partition**;
on a project without a partition, it was never enabled and its drop-in directory was never
laid down: `disable --now` names it without anything to remove, and `rm -rf` does not complain about a
missing directory. Do not skip it for a partitioned project: left there, the door stays `enabled`
and running, and its `code.conf` points to `/opt/brigade-versions/<project>/en-service/runtime`, which
the last line has just erased — it would run on deleted code and never restart.

`uninstall` refuses while the project's runtime is running, refuses to delete a directory that
is not a git clone or that contains the state directory, and can be replayed without complaint. With the
service stopped first, play the command as long as the drop-in exists: without it, the step no longer knows the
project.

**Nothing that origin does not have leaves silently.** As a dry run, the command names everything the
clone and its worktrees carry that would be lost: commits on no branch of origin —
detached heads included —, stashes (`git stash`), uncommitted files. **As long as any
remain, `--confirm` refuses**: push them or undo them, then replay. If the clone is already gone,
the worktrees remaining under the state directory are announced and then removed as they are —
without their clone, git can no longer say what they carry.

| What remains | Where | What to do with it |
|---|---|---|
| The log, the cooks' streams, the backups | `/var/lib/brigade/<project>/` and your backup destination | the history of the kitchen. `sudo rm -rf` if you no longer want it |
| The `brigade*` unit templates (including `brigade-porte@.service`), their `compte.conf` setting, the `brigade` step, its rule and the `brigade-chefs` group | `/etc/systemd/system/`, `/usr/local/bin/`, `/etc/sudoers.d/brigade` | they serve the machine's other projects — **a project's door, for its part, left with it** (instance and drop-ins removed above); remove with the last one. The humans' accounts are theirs, not a project's |
| The labels, `.claude/brigade/`, the bindings block | the repository | do nothing without brigade. The gates and the setup serve any dev; keep them or remove them through an ordinary PR |
| The `cook/*` branches, the open PRs, the cooks' comments | the GitHub repository | ordinary branches, PRs and comments: merge, close, delete them like your own |

**The repository stays an ordinary repository.** Its issues, its PRs and its history carry no
dependency on brigade: no hook, no CI, no file the project loads at runtime.

## On the dev workstation

The command can also be played without systemd, to try a repository before touching the box — with the
variables set by hand, and a reserved clone for the trial:

```bash
BRIGADE_STATE_DIR=<trial state> BRIGADE_PROJECT=<project> BRIGADE_GITHUB_REPO=<owner>/<repo> \
  BRIGADE_REPO_DIR=<a clone reserved for this trial> BRIGADE_BASE_BRANCH=<branch> \
  npm --prefix runtime run installation
```

The manager and reviewer calibration is not a variable: it is set in the trial's log,
through `npm --prefix runtime run station -- manager-modele sonnet` (and its three siblings).

## What only a real box will prove

A dev session has no systemd, no `sudo`, no `sshd`, no new server: this flow is proven there
against stand-ins. The rest is an acceptance run, to be played **by someone who did not
install the first box**, on a new server, noting **what resisted** and **how many
steps it took** — the reference measure is at the top of this document.

**The flow itself** (#315):

1. Steps 1 to 10, in order, without opening another document. At the end, the first ticket
   stops at the open PR, and `brigade <project> grant` shows the grant absent.
2. Step 3: `claude`'s native installer does put its binary under the account's `~/.local/bin`,
   and the `/usr/local/bin` link survives a `claude` update.
3. Step 5: `systemctl show -p User brigade@<project>.service` returns `<account>` (the template's
   `compte.conf` setting applies to its instances), and the rule written by `tee` passes
   `visudo -cf`.
4. `PrivateTmp=yes` in `brigade@.service`: a cook starts and finishes, and `brigade <project>
   installation` — launched outside the unit — still reads the Max session.
5. The traps, provoked: without `libatomic1`, `brigade <project> installation` exits `70` and
   names it; without the `claude` link, it names it as `MISSING`.
6. What GitHub really returns: `permissions.push` and the state of push protection, read by
   step 8 under the box's account.
7. `sudo git -C /opt/brigade status --porcelain` and `sudo git -C /opt/brigade log origin/v2..` return
   nothing at the end (the clone belongs to `root`):
   **nothing in brigade's code had to change for this project.**
8. `brigade <project> installation setup`: report the duration, the weight, and the verdict against the cap the stations declare.

**Uninstall a partitioned project** (#366) — nothing of systemd is played here. On the box,
on a trial project **under partition**, then on a project **without**: the block of "Uninstall" exits
`0` for both (`disable --now` of an instance never enabled does not go red); after it,
`systemctl is-enabled brigade-porte@<project>.service` no longer returns `enabled`, no door
process is running and `/etc/systemd/system/brigade-porte@<project>.service.d` no longer exists.

**The step against a real unit**: what `systemctl show` returns for a value containing a
space, and the `sudoers` rule that names it. Its tests play it against stand-ins.

**Access to the box** (#314) — neither `sshd`, nor `sudo`, nor a second human could be tried:

1. From your machine, the two checks: `ssh -o BatchMode=yes <box> true` (step 2) and
   `ssh -o BatchMode=yes <box> brigade <project> installation` (step 8) return what their
   tables say.
2. "Add a human" for a trial account, then its check: `0`. Removed from the group
   (`gpasswd -d`): **`68`**, and the step's sentence — it is `sudo -n` against a real `sudoers`
   that says it, the tests play it only against a stand-in. **`68` too** (#329), and not `1`,
   for an account outside the group to whom `sudo` gives everything against their password
   (`%sudo ALL=(ALL:ALL) ALL`) and who carries an unrelated `NOPASSWD` entry. That same account,
   in a terminal (`ssh -t <box> 'brigade <project> status < /dev/null'`): `sudo` asks for its
   password, and the command goes.
3. An account locked in by `ForceCommand`: `sshd -T -C user=…` names it.
