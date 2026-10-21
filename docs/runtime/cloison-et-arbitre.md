## The partition

Without it, everything the runtime launches — setup, cook, gates, reviewer, judges — runs under the
service account: a cook reads the state, the clone, the worktrees and the secrets of the **other**
projects, the whole secrets file of its own, the GitHub Apps' keys, and talks to the whole Internet.
The runtime says so at every start (`cloison — none (BRIGADE_SANDBOX_BIN is not set): …`, `réseau — open (BRIGADE_PROXY_PORT is not set): …`; the `cloison —` and `réseau —` prefixes stay in French until the runtime is translated). It is put in place
**project by project**, in two independent halves:

- **Files and processes**, at each launch, through `bwrap` (bubblewrap): its own mount namespace and
  process namespace, unprivileged.
- **The network**, per project: the `brigade@<project>` unit reaches only the loopback; its only way
  out is **the door**, `brigade-porte@<project>`.

**On a station installed by the package, the partition is in place for every project, with no
setting**: the `brigade-station` unit reaches only the loopback, and `brigade-station-porte` holds
one door per project of its configuration — each with its project's allowlist, read from that
project's log, which also receives its refusals — and the station's own door (Anthropic and GitHub
only). Nobody chooses their ports: each door takes back its own or takes a free one, and writes them
to `/var/lib/brigade/portes.json`, from which the station gives each project its own; a line of the
configuration that names its door (`BRIGADE_PROXY_PORT`) is refused. A project whose door has not yet
said its port waits, and the station says so; the station itself waits for its own door before
reaching anything. The switchover stops the old installation's `brigade-porte@<project>` units and
hands their ports to the station's doors: same port, same list — a cook in flight finds its own
again. Refusals are read with `journalctl -u brigade-station-porte`.

The file boundary runs **between the runtime and what it launches**: what it does itself — `git`,
`gh`, `claude auth status` — is not partitioned.

### What a partitioned launch sees

| | |
|---|---|
| **Masked** — an empty directory in its place | each directory of `BRIGADE_SANDBOX_HIDDEN`: on the box `/var/lib/brigade` and `/etc/brigade`, so the state, the clone, the worktrees, the secrets and the keys of **all** the projects, its own included |
| **Given back, writable** | its worktree, and **its view of the clone's `.git`**: objects, references and worktrees are the real ones; the `config` and the `hooks` are **its own** |
| **Given back, read-only** | to the reviewer, the worktree and the view of the `.git`; to the cook with no GitHub identity, its ticket handed over |
| **Read-only** | the whole machine, **and the account's home directory**: its `.gitconfig`, its toolchains, the `claude` binary |
| **Writable, per project** | what is written under `~`: `~/.npm`, `~/.cache`, `~/.claude.json`, any entry the account does not have — in `~` as in `~/.local`, `~/.local/share` and `~/.local/state` —, and what `BRIGADE_SANDBOX_PRIVATE` names — stored in `<state>/compte` |
| **Writable, as is** | `/tmp` (the project's own: `PrivateTmp`) |
| **Replaced** | `~/.claude`: the project's, `<state>/claude` — no transcripts or memory of another project |
| **Max credentials** | `~/.claude/.credentials.json`, mounted **read-only**: `claude` reads them, nothing rewrites them |
| **Processes** | its own: neither `ps` nor `/proc/<pid>/environ` shows another cook |

**Nothing a cook writes is read as configuration, or executed, by the runtime** — whose `git`, `gh`
and `claude` run outside the partition, under the same account and in the same clone:

- **The account** is read-only: a `git config --global` fails, an `npm ci` writes its cache into the
  project's. **Tools write their cache in their usual place, with no setting**: `~/.cache`, `~/.npm`,
  and under `~/.local/share` and `~/.local/state` what the account does not have there (pnpm's
  store, `~/.local/share/pnpm`); jest writes to `/tmp`. This cache belongs to the project, in
  `<state>/compte`: found again from one ticket to the next, never shared with another project. What
  the account keeps under `~/.local` (the `claude` binary) stays read-only. A toolchain that writes
  under `~` (`~/.cargo`, `~/.gradle`) is named in `BRIGADE_SANDBOX_PRIVATE` (names separated by
  `:`): the project has its own, empty at the start.
- **The `.git`.** What a launch configures there (`git config`, `git remote add`, husky) goes into
  the `config` of its view, which the runtime's `git` never reads. The partition sets `gc.auto=0` and
  `maintenance.auto=false` in the served clone. **Do not run `git gc` or `git pack-refs` by hand in
  that clone while a cook is running.**
- **The worktree**, where the runtime runs `git` outside the partition: it reads the worktree's
  `.git` file and its `commondir` itself, and **imposes the repository on `git`**. A file that no
  longer leads to the clone is a **refusal** (``ne désigne plus son dépôt dans le clone (fichier `.git` réécrit)``,
  or ``(`commondir` réécrit)``; this message stays in French until the runtime is translated): at the tick, a warning; at the cook's end, the delivery fails,
  nothing is pushed, the worktree is kept. It **descends into no submodule**: what a cook changes
  there is neither progress nor harvested — it is up to the cook to commit the pointer.
  `core.fsmonitor` and `core.hooksPath` are neutralized. These protections also hold without
  `bwrap`, without replacing it: without it, the clone's `config` and `hooks` stay writable by the cook.

**The runtime refuses to start** if the partition leaves outside what it must hide —
`BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR`, `BRIGADE_SECRETS_FILE` or `BRIGADE_GITHUB_APPS_DIR` outside
every masked directory —, if it would mask the account, `/tmp` or the system, if a mask is a file,
or if it is only half in place.

### The allowlist

On ports 443 and 80: `anthropic.com`, `claude.ai`, `claude.com`, `github.com`,
`githubusercontent.com`, their subdomains, and what the repository declares in
`.claude/brigade/reseau`. **No package registry is open by default.** `/brigade:init` writes that
file — it infers it from what `worktree-setup.sh` installs, and leaves a commented empty file,
never an absent one, when it has nothing to open or could not translate the tool. The hosts come
from the known install lines and the URLs the setup names (`https://cdn.sheetjs.com/…` gives
`cdn.sheetjs.com`); `runtime/src/reseau-cli.ts` makes that inference and writes the file in every
case, never rewriting a file already there. It is a proposal: it opens nothing until it is merged.

```
# .claude/brigade/reseau — one host per line
registry.npmjs.org
*.pythonhosted.org          # the host and its subdomains
base.exemple.org:5432       # a port other than 443 and 80
```

No IP address, no bare `*`, no `*.com`: a line that is not a host opens nothing, and
`npm run partition` shows it.

**The declaration is read on the integration branch, not in the cook's worktree** — unlike the
secrets. A host is therefore opened by a **merge**, which the pass never does itself
(`review-required`, cause `declaration-modified: …`). The runtime re-reads it each time it fetches
the base and at each tick (`network.declared`); the door reads its list there, with no restart.
**The runtime goes out through the door too**: with `BRIGADE_PROXY_PORT`, it sets `HTTPS_PROXY`,
`HTTP_PROXY` and `NO_PROXY` for itself and for everything it launches. **`git` over SSH does not
get through**: the clone's origin must be `https`.

### A refusal can be read

| What is attempted | What the process receives | Where you read it |
|---|---|---|
| a host off the list, through the door | `403`, at once; in clear text, the response names the host and the action that opens it | `npm run partition` (`network.refused`), `journalctl -u brigade-porte@<project>` |
| a connection that bypasses the door | the kernel drops its packets: UDP receives `EPERM`, **TCP waits for its client's timeout** — to confirm on the box | nowhere |
| a permitted host that does not answer | `502` | the response |

One event per host and per ten minutes, a hundred hosts named at most. **The unit's filter is probed
at every start**: if it does not hold, the runtime says so — `BUT a direct send goes out: the unit does
not seem to filter anything (IPAddressDeny)`. Its verdict is confirmed on the box (acceptance run).

### What is refused, and why

`BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run partition` reads the log
(`isolation.configured`, written at start when the partition's state changes) and shows: `files`
(`PARTITIONED` or `OPEN`, what is masked), `network` (`ALLOWLIST` or `OPEN`, and whether the unit
filters), `what gets through` (each host, and where it comes from), and the `latest refusals`.

### Trying it, and what it costs

```bash
brigade <project> partition probe [<tries>]
```

Real probes, with no cook or quota: the launch goes into `bwrap`, every masked directory is empty,
the Max credentials are read-only, tools write their cache under `~` (`~/.cache`, `~/.npm`,
`~/.local/share`, `~/.local/state`), other projects' processes are invisible, `claude` finds the Max
connection again; then the cost of a launch. A failing probe returns code 1 and says why. To be
played on the box: it is a step of the acceptance run.

### The project's transcripts are tidied

Under the partition, `claude` writes its transcripts into `<state>/claude/projects/`, and **the
runtime tidies them** — at start, then once a day. A transcript that nothing has written to for
`BRIGADE_TRANSCRIPTS_KEEP_DAYS` days (`7` by default; `0.5` is twelve hours) goes, with its session
directory. What stays: everything written since the oldest launch still running left, and what is
not a transcript (the project's memory, its settings). A link is never followed. Each pass is in the
log — `transcripts.tidied` (`removed`, `freedBytes`, `kept`, `keptBytes`, `keepMs`) —, and `status`
shows the latest; a project that restarts without the partition writes `transcripts.released`,
once. **Without the partition, nothing is tidied**: the transcripts go under the account's
`~/.claude`, where the runtime never removes anything — it only writes there the copy of the
transcript that a send-back resumes, in the project directory of its worktree. A removed transcript
is not lost for diagnosis: the raw stream stays under `runs/`, and is backed up. It is lost for
resuming a send-back: past the keeping period, the send-back's cook starts again from zero
(« Le cook d'un renvoi reprend la session du précédent »).

### What is not guaranteed

- **None of this has run on the box yet.** Two things can only be proven there: the unit's filter
  (`IPAddressDeny`), and the real `claude` under the partition — whose Max token renewal perhaps
  fails read-only (a cook that ends `disconnected` while `claude auth status`, outside the partition,
  answers connected).
- **The Max credentials stay readable by the cook.** "Not copyable" rests on the allowlist and on
  the absence of a shared mount; what remains is the pushed branch, where the station refuses their
  name or their shape (`credentials-committed`). A transformed copy gets through.
- **The account's directory stays readable by all projects**, read-only. What it keeps that is
  sensitive (`~/.ssh`, `~/.config/gh`) is added to `BRIGADE_SANDBOX_HIDDEN`; a single file
  (`~/.netrc`) cannot be masked, its directory is what gets masked.
- **A clone where `extensions.worktreeConfig` is enabled reopens the path** to the configuration:
  do not enable it in the served clone. **A cook can make another cook's delivery of the same
  project fail**: `<clone>/.git/worktrees/`, the objects and the references are shared writable.
  Rewriting a neighbour's directory launches nothing — its delivery is refused.
- **The filters that the account's or the clone's configuration names are still called**
  (`git-lfs`).
- **The account's cache is no longer shared**: each project fills its own, which nothing tidies. Of
  the project's `~/.claude`, only the transcripts are tidied; it is not backed up.
- **The loopback is common to the projects**: a service on `localhost` is reachable by all, and has
  only its password as protection. **Name resolution stays open**: a DNS tunnel gets out.
  **`github.com` is on the allowlist**: under the single identity, the cook writes there with the
  machine's account — the closing is one identity per role.

## The arbiter between projects

As soon as a second project runs on the machine, the Max account and the machine are shared. The
arbiter is the process that adds them up: **one per machine**, with no LLM. It answers only one
question: *can this project launch one more cook?* It is **optional** — without it, a project runs
as before (`arbitre — aucun`, a message that stays in French until the runtime is translated). A runtime is pointed to it by `BRIGADE_ARBITER_PORT`.

### What it knows, and from where

Each runtime **tells it again** the state of its project — its ticket cooks in flight, whether it
has tickets it could launch, whether it holds them back for "machine saturated", what its cooks
have consumed — at every request for a place, at every change, at every tick, and when it stops. A
project stopped by the chef, with the breaker open, the base red, disconnected, the quota exhausted
or at its own cap **asks for nothing**. The arbiter keeps this last word **in memory**, and counts
only **ticket** cooks. On disk (`arbitre.db`, in `BRIGADE_ARBITER_STATE_DIR`): your settings alone,
re-read at every decision.

### The rule

`P` is the account's cap on cooks, all projects together (`BRIGADE_ARBITER_MAX_COOKS`, **no
default**: the arbiter refuses to start without it). A project **counts** if it has cooks, waiting
tickets, or if it is known and has not spoken again.

- **Each project that counts has a share**: the cap in proportion to its weight, rounded down,
  **never less than one place**. **Under its share, it passes**, as long as the account is not full.
- **Beyond it, it borrows** the places nobody asks for — never while a known project has not spoken
  again. **No preemption**: the arbiter never kills a cook, it holds back the next one.
- **When the machine saturates** (a runtime says it is holding tickets back for it), shares are
  computed on **the number of cooks running** and nobody borrows any more.

A refused project reads it as a hold: `station.held`, reason `arbiter`, in `run status` and `run
station`. It asks again at its next wake-up — a minute at most.

### Arbiter unreachable: the project launches anyway

When the designated arbiter does not answer (connection refused, unreadable response, ten seconds of
guard), the project goes into **degraded mode**: **at most one ticket cook at a time**, the cooks
already gone finish. This is written **once** on entry (`station.unarbitrated`, and `journalctl`),
once on return (`station.arbitrated`); each cook launched this way carries `unarbitrated: true`;
`run status` (`ARBITER UNREACHABLE for …`) and `run station` show it. Each launch attempt asks again
first: as soon as the arbiter answers, normal running resumes.

### When it restarts

It starts **empty**. As long as a **known project has not spoken again**, its share stays
**reserved** (`HAS NOT SPOKEN SINCE …`); it is freed if it speaks again, if its runtime stops
cleanly, or if you remove it. **Stopped for good without a clean stop, it keeps the share until you
remove it.**

### Reading it, and setting it

```bash
export BRIGADE_ARBITER_PORT=<port> BRIGADE_ARBITER_STATE_DIR=<arbiter directory>
npm --prefix runtime run arbiter                          # the state
npm --prefix runtime run arbiter -- weight thermigo 3     # "thermigo has priority this week"
npm --prefix runtime run arbiter -- remove vieux-projet   # its share is no longer reserved
```

What `arbiter` writes is in English (`account cap`, `weight 1 · 2 running · share 5 · 3 left`,
`cooks consumed`). Per project: its weight, its cooks running, its **`share`**, and **`left`** —
what it could launch in addition right now, borrowing included; `machine` says `SATURATED according
to <projects>`. **The weight** is an integer, 1 by default, durable, with no expiry; it touches no
cap — neither the account's, nor each project's (`run station -- cooks <N>`). **The cooks'
consumption is not the account's**, and the arbiter holds nothing back because of it. With the
arbiter unreachable, the command says so and exits with code 1.

### What is not guaranteed

- **A runtime dead without saying so leaves its last word** with the arbiter until it speaks again
  or you remove it. **Just after an arbiter restart**, what had been borrowed before is still
  running: the cap can be exceeded by that loan, until those cooks finish.
- **A cook reaches the loopback**, hence the arbiter: it could speak there in a project's name, and
  skew a count that the runtime tells again at the next exchange. It cannot set the weights, which
  the partition masks from it.
- **The arbiter does not know the account's quota**: see « 86 : le quota est épuisé ».
