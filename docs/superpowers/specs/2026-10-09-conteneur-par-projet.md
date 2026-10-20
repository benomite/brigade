# One container per project, and an allowlisted network (#176)

Milestone 7 of V2 (epic #179). V2 spec, §Isolation and secrets: "**One container per project, one
worktree per cook**", "container network on an allowlist: Anthropic, GitHub, package registries",
"credentials mounted read-only".

## The problem

Everything the runtime launches — setup, cook, gates, reviewer, judges — runs under the service's
Unix account, with nothing around it. A cook therefore reads whatever that account reads: the state,
the clone, the worktrees and the secrets file of the **other** projects, the secrets file of its own
**in full**, the GitHub Apps' keys, the environment of the other cooks (`/proc/<pid>/environ`). And
it talks to the whole Internet. #174 and #175 named these holes and referred their resolution here.

## What is settled

### No image, no daemon: two grains, two mechanisms

The box is a systemd Linux with nothing installed for this. A container engine (Docker, Podman)
would add a daemon or an image store to keep up to date, one image per project to build with
everyone's toolchain, and the mounting, one by one, of what `claude`, `git` and `gh` need — for a
partition the kernel already provides. The "container" here is what a container is made of, without
the image:

| What is partitioned | Grain | Mechanism | Cost per cook |
|---|---|---|---|
| **Files and processes** | **each launch** (setup, cook, gates, reviewer, judge) | `bwrap` (bubblewrap): one mount namespace and one process namespace per launch, unprivileged | one `bwrap` that stays for the duration of the launch — measured below |
| **The network** | **the project** | the systemd unit `brigade@<project>` reaches only the loopback (`IPAddressDeny=any`, `IPAddressAllow=localhost`); its only way out is **the door**, `brigade-porte@<project>`, an HTTP relay that holds the allowlist | nothing: one door per project, not per cook |

**Why the launch and not the whole runtime, for files.** Wrapping the project's runtime would cost
nothing per cook, but would leave the cook on the same side as the runtime: it would still read the
Apps' keys and the secrets file in full — precisely what #174 and #175 expect from here. The
boundary therefore runs between the runtime and what it launches.

**Why the project and not the launch, for the network.** A network namespace per launch would cut
the machine's loopback: the test database that the setup prepares on `localhost` would no longer
answer. The unit's filter leaves the loopback intact — the ports the setup exports stay reachable
as before — and asks no privilege of the runtime.

### What a partitioned launch sees

Set by `BRIGADE_SANDBOX_BIN` (the `bwrap` binary, absolute path) and `BRIGADE_SANDBOX_HIDDEN`
(the hidden directories, separated by `:` — on the box `/var/lib/brigade:/etc/brigade`).

| | |
|---|---|
| **Hidden** (an empty directory in its place) | each root of `BRIGADE_SANDBOX_HIDDEN`: the state, the clone, the worktrees, the secrets and the keys of **all** projects, its own included |
| **Given back, writable** | its worktree; **its view of the clone's `.git`** — the real objects, references and worktrees, but a `config` and `hooks` of its own |
| **Given back, read-only** | the worktree and the view of the `.git` for the reviewer; the ticket handed to the cook (#174) |
| **Read-only** | the whole machine, **and the account's home directory** (`.gitconfig`, toolchains, the `claude` binary) |
| **Project-owned, writable** | what is written under `~`: `.cache`, `.npm`, `.claude.json`, any entry the account does not have, and what `BRIGADE_SANDBOX_PRIVATE` names — in `<state>/compte` |
| **Writable, as is** | `/tmp` |
| **Replaced** | `~/.claude`: the project's (`<state>/claude`) — neither the transcripts nor the memory of another project |
| **Max credentials** | `~/.claude/.credentials.json`, mounted over it **read-only** |
| **Processes** | its own only: neither `ps` nor `/proc/<pid>/environ` shows another cook |

The runtime refuses to start if `BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR`, `BRIGADE_SECRETS_FILE` or
`BRIGADE_GITHUB_APPS_DIR` is not under a hidden root: a partition that leaves outside what it should
hide is not one. A mask that is a file is refused too.

The manager's judges start from `/tmp`, with no repository. The startup `claude auth status` and
everything the runtime does itself (`git`, `gh`) are not partitioned: the runtime is the boundary.

**Nothing a cook writes is read as configuration or executed by the runtime** (review point 1). The
runtime's `git`, `gh` and `claude` run outside the partition, under the same account and in the same
clone: a `~/.gitconfig`, a `.git/config`, a hook or a binary under `~` that a cook could write would
be executed by the runtime, for all projects. Hence two stand-ins, rather than two files mounted
read-only — a mounted file cannot be replaced, and `git` writes its config by replacing it
(`EBUSY`):

- **The account**: in its place, the project's directory (`<state>/compte`), writable, and over it,
  each entry of the real one, read-only. The caches are the project's, cold on the first launch.
  `.claude.json` is copied once, then lives its own life.
- **The `.git`**: in its place, one view per worktree (`<state>/vues-git/…`, hidden, so reached only
  when mounted) whose `config` is a copy of the real one and whose `hooks` an empty directory; over
  it, each directory of the real `.git`. `git config`, `remote add`, `switch --track`, a submodule,
  husky write there; this holds from the setup to the cook and leaves with the worktree. The files
  of the real `.git` (`HEAD`, `packed-refs`, created if missing) are read-only: `git gc` no longer
  packs the references there — born in the view, `packed-refs` would have carried off the cook's
  branch. For the same reason, the served clone never packs its references on its own
  (`gc.auto=0`, `maintenance.auto=false`, set in its config): the runtime's `git fetch` does not
  move the branch of a live cook. Before each launch, the runtime removes from the view whatever a
  cook left there in place of a mount point.

**The runtime's `git` in a cook's worktree: an imposed repository, not one more partition** (#213).
The runtime runs `git` in a cook's worktree outside the partition — status at each tick, harvest,
return of a branch. Yet a worktree itself designates its repository, through files the cook
writes: its `.git` file, the `commondir` of `<clone>/.git/worktrees/<id>/`, a submodule's `.git`.
Two leads:

- *Run that `git` partitioned, read-only.* Set aside: the harvest **writes** (index, commit,
  reference), so a writable partition would be needed, and the cook's command would run there all
  the same — contained, but launched, with the clone's `.git` within reach. It costs one `bwrap`
  per tick and per cook. And it is worth nothing without a partition.
- *Impose the repository and neutralize.* **Chosen**, because it holds with and without a partition
  and costs no process: `--git-dir` and `--work-tree` imposed, `GIT_COMMON_DIR` set to the clone's
  `.git`, `core.fsmonitor=false`, `core.hooksPath=/dev/null`, `submodule.recurse=false`, and
  submodules left out of the status (`--ignore-submodules=all`) as of the harvest (excluded from
  `git add`, one by one).

Three things measured (git 2.50), which shape the code:

- **`GIT_COMMON_DIR` does not impose the references.** Configuration and objects do come from the
  imposed directory, but `git` still looks for references through the `commondir` file: with a
  rewritten `commondir`, the harvest was committed on a branch of the cook's repository, and the
  station pushed the old one — silently. The runtime therefore reads `commondir` itself and
  **refuses** if it does not lead to the clone. The `.git` file likewise: it must name a directory
  of `<clone>/.git/worktrees/`, without a link.
- **`-c core.fsmonitor=false` follows `git` into a submodule, but not the rest**: a `clean` filter
  from the submodule's configuration is launched there all the same. Neutralizing is not enough;
  one must not descend.
- **`git add --all` descends into a tracked submodule**, even under `diff.ignoreSubmodules=all`,
  and has no option to refrain: the harvest excludes them by path, from the index.

A diverted file is a **refusal that can be read**, not a silence: unreadable worktree at the tick,
failed delivery and worktree kept at the end of the cook.

What this choice leaves open: a submodule is neither watched nor harvested; a clone where
`extensions.worktreeConfig` is enabled makes `git` read a `config.worktree` that the cook writes
(it cannot enable it under the partition); between the runtime's reading of `commondir` and
`git`'s, a live cook can rewrite it — the configuration stays the clone's, only a tick's
fingerprint can be skewed; the administration directories being shared, a cook can get a
neighbour's delivery refused; without a partition, the clone's `config` stays with the cook. The
pass's disposable worktrees are not concerned: the runtime runs `git` there (the merge) only before
running anything in them, and then only removes them — which reads no configuration of the
worktree, also measured.

**The stop signal gets through.** The supervisor sends SIGTERM to the group, then SIGKILL after the
grace. `bwrap` relays no signal and would die of SIGTERM, taking the cook with it: it is launched
deaf to SIGTERM, and the command gets its own back (`env --default-signal=TERM`). Tried under
Linux.

### The allowlist

| Host | Why |
|---|---|
| `anthropic.com`, `claude.ai`, `claude.com` and their subdomains | the model, through the Max connection |
| `github.com`, `githubusercontent.com` and their subdomains | the repository, the issues, the archives |
| what the repository declares in `.claude/brigade/reseau` | **its package registries** and the rest |

No registry is opened by default: "the project's registries" are the ones it names. One host per
line, `#` comments; `*.example.org` opens the subdomains; `host:port` opens a port other than 443
and 80. No IP address, no bare `*`, no `*.com`.

The declaration is read **on the clone's integration branch**, not in the cook's worktree — the
reverse of secrets: a cook that adds a secret's name gains nothing, a cook that added a host would
open the door for itself. The runtime rereads it at each tick and writes to the log what changes
(`network.declared`); the door reads its list there.

**A refusal can be read.** Through the door: `403`, on the spot, with the host and the action that
opens it; and a `network.refused` event in the log (host, port, number of attempts — at most one per
host and per ten minutes). Through the door, never a timeout. Whatever bypasses it on purpose does
not get through; a TCP connection whose packets the kernel drops probably waits out its client's
timeout — not observed.

**The runtime goes through the door too** (`BRIGADE_PROXY_PORT`): it sets `HTTPS_PROXY`,
`HTTP_PROXY` and `NO_PROXY` for itself and for everything it launches. At startup, it probes the
filter with a datagram to an address nobody carries: the unit's filter drops the packets on the way
out and the kernel returns that refusal to the sender (`EPERM`), whereas a TCP connection would wait
in both cases. Refused, the filter holds; gone through, it **says** that the door is only a
courtesy; with no answer, it concludes nothing. **This verdict has never seen a real filter**: it is
a hint, which the acceptance run confirms.

### Without a partition, it says so

The two halves are optional and independent. Absent, the runtime runs as yesterday and announces it
at startup: the projects served under this account can see each other, and the cooks reach
everything. The partition's state enters the log (`isolation.configured`, when it changes).

### What the chef reads

`npm --prefix runtime run partition`: what is hidden, what is read-only, the allowlist with the
origin of each host, and the latest refusals with their reason — from the log, with no environment
variable other than `BRIGADE_STATE_DIR`.

`npm --prefix runtime run partition -- probe [<tries>]`, with the service's environment: runs real
probes in the partition (hidden roots empty, credentials not writable, other people's processes
invisible, `claude` that answers), and **measures the cost** of a partitioned launch — time and
resident memory — multiplied by the cap on cooks.

## What it costs per cook

Measured on 2026-10-09 in a Linux (kernel 6.x, bubblewrap 0.8.0, Node 26) on the dev workstation,
by `partition -- probe` — to be redone on the box, that is the acceptance run:

| | Without a partition | With | Per launch | At 30 cooks |
|---|---|---|---|---|
| Startup time (median of 50 `true`) | 0.4 ms | 1.8 ms | **+1.4 ms** (up to +7 ms on a loaded workstation) | +40 ms cumulative |
| Resident memory while the launch lives (the two `bwrap` processes) | — | 3.1 MB | **+3.1 MB** | **+94 MB** |

The machine guard (#98) requires 1,024 MB free by default and reserves 512 MB for a cook that has
just left: the partition weighs less than a hundredth of a cook. Memory is counted generously —
resident, shared pages included. The door is one Node process per project, not per cook.

Tried in the same place with the real `bwrap`: the hidden roots are empty, the secrets file and the
project's log are not found, a commit goes through in the worktree, the clone's real `config` and
real `hooks` stay intact, the credentials can be read and can neither be rewritten nor removed,
`~/.claude` is the project's, `~/.gitconfig` and a binary under `~` cannot be written, the cache is
written into the project's account, `git config`, `remote add`, `switch --track`, a submodule and a
husky hook go through without touching the real config, the host's processes are invisible, a port
of the host's loopback can be reached, the setup returns its exports through the channel, SIGTERM
leaves the cook its grace and returns its code, SIGKILL leaves no survivor. And the door, with the
real network: `curl`, `git`, `npm` and the runtime's `fetch` go through to GitHub and a declared
registry, and are refused in 13 ms elsewhere.

## What remains unguaranteed (to be written in the docs)

- **None of this has run on the box.** The mechanics are tested behind a fake `bwrap`, and the real
  one is tried in a Linux on the dev workstation. The unit's filter (`IPAddressDeny`) and `claude`
  under the partition can only be proved there.
- **The Max token perhaps renews badly read-only**: if `claude` wants to rewrite its credentials
  from a cook, it cannot. To watch on the box over the life of a token.
- **The Max credentials remain readable by the cook** — `claude` reads them. "Not copyable" rests on
  this: no exit other than the allowlist, and no writable mount shared outside the project. What
  remains is **the pushed branch**: a cook that commits the file gets it pushed. The runtime never
  opens that file, so does not look for it in a delivery.
- **The home directory remains readable by all projects** (read-only), and **the loopback is
  shared**: a service listening on `localhost` can be reached by all. Another project's door too.
- **A submodule is neither watched nor harvested**, and **a clone where `extensions.worktreeConfig`
  is enabled** makes the runtime's `git` read a file of the cook's — what the choice of #213
  leaves, see above.
- **`git gc` and `git pack-refs` fail under the partition**, and the account's cache is no longer
  shared between projects.
- **Name resolution remains open** (the local resolver): a DNS tunnel gets out.
- **`github.com` is allowlisted**: under the single identity, the cook writes there with the
  machine's account. The fix is one identity per role (#174).
- **A host opens through a merge**: a delivery that touches `.claude/brigade/reseau` and that the
  pass merges under a grant opens the host to the next cook. The log says so; nothing stops it.
- **`git` over SSH does not get through**: the clone's origin must be `https`.

## Out of scope

Production access; the Mac runner; the arbiter between projects (#178); a network namespace per
cook; stopping the pass on a delivery that touches the network declaration.

## Plan

1. `cloison.ts`: configuration, `bwrap` wrapper — unit tests behind a fake.
2. `gates.ts`, `station.ts`, `pass.ts`, `manager.ts`, `installation.ts`: each launch goes through
   the partition.
3. `reseau.ts`: rules, declaration, relay variables, publication to the log.
4. `porte.ts`, `tenir-porte.ts`: the relay, its refusals, its log.
5. `montrer-cloison.ts`, `eprouver.ts`: what the chef reads, the probes, the measurement.
6. `main.ts`: wiring, announcements. `deploy/`: `brigade-porte@.service`, `cloison.conf`.
7. `docs/runtime.md`, `docs/installer.md`.
