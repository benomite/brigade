## The partition

Without it, everything the runtime launches — setup, cook, gates, reviewer, judges — runs under the
service account: a cook reads the state, clone, worktrees and secrets of the **other** projects, its
own whole secrets file, the GitHub Apps' keys, and talks to the whole Internet. The runtime says so
at every start (`cloison — none (BRIGADE_SANDBOX_BIN is not set): …`, `réseau — open
(BRIGADE_PROXY_PORT is not set): …`; prefixes stay French). It is put in place **project by
project**, in two independent halves:

- **Files and processes**, at each launch, through unprivileged `bwrap` (own mount and process
  namespaces).
- **The network**: the `brigade@<project>` unit reaches only the loopback; its only way out is **the
  door**, `brigade-porte@<project>`.

**On a station installed by the package, both are in place for every project, with no setting**: the
`brigade-station` unit reaches only the loopback, and `brigade-station-porte` holds one door per
configured project — each with its allowlist, read from that project's log, which also receives its
refusals — plus the station's own door (Anthropic and GitHub only). Ports are not chosen: each door
takes back its own or a free one and writes it to `/var/lib/brigade/portes.json`, from which the
station gives each project its own; a configuration line naming `BRIGADE_PROXY_PORT` is refused. A
project whose door has not said its port waits, and the station says so; the station waits for its
own door. The switchover stops the old `brigade-porte@<project>` units and hands their ports to the
station's doors, same port, same list. Refusals: `journalctl -u brigade-station-porte`.

The file boundary runs **between the runtime and what it launches**: its own `git`, `gh`,
`claude auth status` are not partitioned.

### What a partitioned launch sees

| | |
|---|---|
| **Masked** — an empty directory | each directory of `BRIGADE_SANDBOX_HIDDEN`: on the box `/var/lib/brigade` and `/etc/brigade` — state, clone, worktrees, secrets and keys of **all** projects, its own included |
| **Given back, writable** | its worktree, and **its view of the clone's `.git`**: real objects, references and worktrees; its **own** `config` and `hooks` |
| **Given back, read-only** | to the reviewer, the worktree and `.git` view; to the cook with no GitHub identity, its ticket |
| **Read-only** | the whole machine and **the account's home**: `.gitconfig`, toolchains, the `claude` binary |
| **Writable, per project** | what is written under `~` (`~/.npm`, `~/.cache`, `~/.claude.json`, any entry the account lacks, also in `~/.local`, `~/.local/share`, `~/.local/state`) and what `BRIGADE_SANDBOX_PRIVATE` names — stored in `<state>/compte` |
| **Writable, as is** | `/tmp` (the project's own: `PrivateTmp`) |
| **Replaced** | `~/.claude`: the project's `<state>/claude` — no other project's transcripts or memory |
| **Max credentials** | `~/.claude/.credentials.json`, mounted **read-only** |
| **Processes** | its own: neither `ps` nor `/proc/<pid>/environ` shows another cook |

**Nothing a cook writes is read as configuration, or executed, by the runtime** — whose `git`, `gh`
and `claude` run outside the partition, same account, same clone:

- **The account** is read-only: `git config --global` fails. **Tools write their cache in their
  usual place, with no setting** (`~/.cache`, `~/.npm`, pnpm's `~/.local/share/pnpm`; jest writes to
  `/tmp`), belonging to the project in `<state>/compte`: found again from ticket to ticket, never
  shared. What the account keeps under `~/.local` (the `claude` binary) stays read-only. A toolchain
  writing under `~` (`~/.cargo`, `~/.gradle`) goes in `BRIGADE_SANDBOX_PRIVATE` (names separated by
  `:`): the project has its own, empty at start.
- **The `.git`.** What a launch configures there (`git config`, `git remote add`, husky) goes into
  its view's `config`, which the runtime's `git` never reads. The partition sets `gc.auto=0` and
  `maintenance.auto=false` in the served clone. **Do not run `git gc` or `git pack-refs` by hand in
  that clone while a cook runs.**
- **The worktree.** The runtime reads its `.git` file and `commondir` itself and **imposes the
  repository on `git`**. A file no longer leading to the clone is a **refusal** (``ne désigne plus
  son dépôt dans le clone (fichier `.git` réécrit)``, or ``(`commondir` réécrit)``; French): at the
  tick a warning; at the cook's end the delivery fails, nothing is pushed, the worktree is kept. It
  **descends into no submodule**: the cook must commit the pointer. `core.fsmonitor` and
  `core.hooksPath` are neutralized. These protections also hold without `bwrap`, which they do not
  replace: without it the clone's `config` and `hooks` stay writable by the cook.

**The runtime refuses to start** if `BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR`, `BRIGADE_SECRETS_FILE`
or `BRIGADE_GITHUB_APPS_DIR` lie outside every masked directory, if it would mask the account,
`/tmp` or the system, if a mask is a file, or if the partition is only half in place.

### The allowlist

On ports 443 and 80: `anthropic.com`, `claude.ai`, `claude.com`, `github.com`,
`githubusercontent.com`, their subdomains, and what the repository declares in
`.claude/brigade/reseau`. **No package registry is open by default.** `/brigade:init` writes that
file, inferring it from what `worktree-setup.sh` installs (known install lines and URLs the setup
names: `https://cdn.sheetjs.com/…` gives `cdn.sheetjs.com`); with nothing to open, a commented empty
file, never an absent one. `runtime/src/reseau-cli.ts` does this and never rewrites an existing
file. It is a proposal: it opens nothing until merged.

```
# .claude/brigade/reseau — one host per line
registry.npmjs.org
*.pythonhosted.org          # the host and its subdomains
base.exemple.org:5432       # a port other than 443 and 80
```

No IP address, no bare `*`, no `*.com`: such a line opens nothing, and `npm run partition` shows it.

**The declaration is read on the integration branch, not the cook's worktree** — unlike secrets. A
host is opened by a **merge**, which the pass never does itself (`review-required`, cause
`declaration-modified: …`). The runtime re-reads it at each base fetch and tick (`network.declared`);
the door reads its list there, with no restart. **One exception, by the chef's choice (#1397)**: a
host the project's setup reaches and the list lacks is opened by the kitchen alone, before that
setup (`repair.network`, appended to every declaration it publishes; a `repair.done` line says so). It
writes nothing in the file: the host stays open for following cooks, dev secrets included, until the
base declares it. **The runtime goes out through the door too**: with `BRIGADE_PROXY_PORT` it sets
`HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` for itself and what it launches. **`git` over SSH does not
get through**: the origin must be `https`.

### A refusal can be read

| What is attempted | What the process receives | Where you read it |
|---|---|---|
| a host off the list, through the door | `403` at once; the response names the host and the action that opens it | `npm run partition` (`network.refused`), `journalctl -u brigade-porte@<project>` |
| a connection bypassing the door | packets dropped by the kernel: UDP gets `EPERM`, **TCP waits for its client's timeout** — to confirm on the box | nowhere |
| a permitted host that does not answer | `502` | the response |

One event per host per ten minutes, a hundred hosts at most. **The unit's filter is probed at every
start**: if it does not hold, the runtime says `BUT a direct send goes out: the unit does not seem
to filter anything (IPAddressDeny)`. Confirmed on the box (acceptance run).

### What is refused, and why

`BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run partition` reads the log
(`isolation.configured`, written at start when the state changes) and shows `files` (`PARTITIONED`
or `OPEN`, what is masked), `network` (`ALLOWLIST` or `OPEN`, whether the unit filters), `what gets
through` (each host and its source) and the `latest refusals`.

### Trying it, and what it costs

```bash
brigade <project> partition probe [<tries>]
```

Real probes, with no cook or quota: launch goes into `bwrap`, masked directories are empty, Max
credentials read-only, tools write their cache under `~`, other projects' processes invisible,
`claude` finds the Max connection; then the cost of a launch. A failing probe returns code 1 and says
why. A step of the acceptance run, to play on the box.

### The project's transcripts are tidied

Under the partition `claude` writes transcripts into `<state>/claude/projects/`, and **the runtime
tidies them** at start, then daily. A transcript nothing has written to for
`BRIGADE_TRANSCRIPTS_KEEP_DAYS` days (`7` by default; `0.5` is twelve hours) goes with its session
directory. Kept: everything written since the oldest launch still running left, and non-transcripts
(memory, settings). A link is never followed. Each pass logs `transcripts.tidied` (`removed`,
`freedBytes`, `kept`, `keptBytes`, `keepMs`), `status` shows the latest; a project restarting
without the partition writes `transcripts.released`, once. **Without the partition nothing is
tidied**: transcripts go under the account's `~/.claude`, where the runtime removes nothing — it only
writes there the copy a send-back resumes. A removed transcript still leaves the raw stream under
`runs/`, backed up, for diagnosis; but past the keeping period a send-back's cook starts from zero.

### What is not guaranteed

- **None of this has run on the box yet.** Only there can be proven the unit's filter
  (`IPAddressDeny`) and the real `claude` under the partition — whose Max token renewal may fail
  read-only (a cook ending `disconnected` while `claude auth status` outside answers connected).
- **The Max credentials stay readable by the cook.** "Not copyable" rests on the allowlist and no
  shared mount; what remains is the pushed branch, where the station refuses their name or shape
  (`credentials-committed`). A transformed copy gets through.
- **The account's directory stays readable by all projects**, read-only. Sensitive parts (`~/.ssh`,
  `~/.config/gh`) go in `BRIGADE_SANDBOX_HIDDEN`; a single file (`~/.netrc`) cannot be masked, its
  directory is.
- **A clone with `extensions.worktreeConfig` enabled reopens the path** to the configuration: do not
  enable it. **A cook can make another's delivery of the same project fail**:
  `<clone>/.git/worktrees/`, objects and references are shared writable. Rewriting a neighbour's
  directory launches nothing — its delivery is refused.
- **Filters named by the account's or clone's configuration are still called** (`git-lfs`).
- **The account's cache is no longer shared**: each project fills its own, untidied. Of the
  project's `~/.claude` only transcripts are tidied; it is not backed up.
- **The loopback is common to projects**: a `localhost` service is reachable by all, protected only
  by its password. **Name resolution stays open**: a DNS tunnel gets out. **`github.com` is
  allowlisted**: under the single identity the cook writes there with the machine's account — the
  closing is one identity per role.

## The arbiter between projects

With a second project, the Max account and the machine are shared. The arbiter adds them up: **one
per machine**, no LLM, answering one question: *can this project launch one more cook?* It is
**optional**: without it a project runs as before (`arbitre — aucun`, French). A runtime is pointed
to it by `BRIGADE_ARBITER_PORT`.

### What it knows, and from where

Each runtime **tells it again** its project's state — ticket cooks in flight, whether it has
launchable tickets, whether it holds them for "machine saturated", what its cooks consumed — at each
request for a place, change, tick, and stop. A project stopped by the chef, breaker open, base red,
disconnected, quota exhausted or at its own cap **asks for nothing**. The arbiter keeps this last
word **in memory**, counting only **ticket** cooks. On disk (`arbitre.db`, in
`BRIGADE_ARBITER_STATE_DIR`): your settings alone, re-read at every decision.

### The rule

`P` is the account's cap on cooks, all projects together (`BRIGADE_ARBITER_MAX_COOKS`, **no
default**: the arbiter refuses to start without it). A project **counts** if it has cooks, waiting
tickets, or is known and has not spoken again.

- **Each counting project has a share**: the cap in proportion to its weight, rounded down, **never
  under one place**. **Under its share it passes**, while the account is not full.
- **Beyond it, it borrows** places nobody asks for — never while a known project has not spoken
  again. **No preemption**: no cook is killed, the next is held back.
- **When the machine saturates** (a runtime holds tickets for it), shares are computed on **cooks
  running** and nobody borrows.

A refused project reads a hold: `station.held`, reason `arbiter`, in `run status` and `run
station`, and asks again at its next wake-up — a minute at most.

### Arbiter unreachable: the project launches anyway

When the arbiter does not answer (connection refused, unreadable response, ten seconds' guard), the
project goes **degraded**: **at most one ticket cook at a time**; cooks already gone finish. Written
**once** on entry (`station.unarbitrated`, `journalctl`) and on return (`station.arbitrated`); each
such cook carries `unarbitrated: true`; `run status` (`ARBITER UNREACHABLE for …`) and `run station`
show it. Each launch attempt asks again first: once it answers, normal running resumes.

### When it restarts

It starts **empty**. While a **known project has not spoken again**, its share stays **reserved**
(`HAS NOT SPOKEN SINCE …`), freed if it speaks, stops cleanly, or you remove it. **Stopped for good
without a clean stop, it keeps the share until you remove it.**

### Reading it, and setting it

```bash
export BRIGADE_ARBITER_PORT=<port> BRIGADE_ARBITER_STATE_DIR=<arbiter directory>
npm --prefix runtime run arbiter                          # the state
npm --prefix runtime run arbiter -- weight compta 3     # "compta has priority this week"
npm --prefix runtime run arbiter -- remove vieux-projet   # its share is no longer reserved
```

Output is English (`account cap`, `weight 1 · 2 running · share 5 · 3 left`, `cooks consumed`).
Per project: weight, cooks running, **`share`**, and **`left`** — what it could launch now, borrowing
included; `machine` says `SATURATED according to <projects>`. **The weight** is an integer, 1 by
default, durable, never expiring; it touches no cap — neither the account's nor a project's (`run
station -- cooks <N>`). **Cooks' consumption is not the account's**; the arbiter holds nothing back
for it. With the arbiter unreachable, the command says so and exits 1.

### What is not guaranteed

- **A runtime dead without saying so leaves its last word** until it speaks or you remove it.
  **Just after an arbiter restart**, earlier loans still run: the cap can be exceeded until those
  cooks finish.
- **A cook reaches the loopback**, hence the arbiter: it could speak in a project's name and skew a
  count the runtime restates at the next exchange. It cannot set weights, which the partition masks.
- **The arbiter does not know the account's quota**: see "86: the quota is exhausted" in
  [`station-cook.md`](station-cook.md).
