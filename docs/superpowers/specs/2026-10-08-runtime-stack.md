# brigade V2 — runtime stack

**Date**: 2026-10-08
**Status**: decided (issue #21) — resolves, for the runtime, open question no. 1 of
`2026-10-08-brigade-v2-design.md`
**Scope**: the runtime that runs on the parade-box. The stack of the **desktop app** is not
settled here; it waits for milestone 6.

---

## The decision

| Subject | Decision |
|---|---|
| **Language** | TypeScript run **directly by Node 26** (native type stripping): no build, no bundler |
| **Dependencies** | **Zero runtime dependencies** at milestone 1: `node:sqlite`, `node:test`, `node:child_process`. Only two dev dependencies (`typescript`, `@types/node`), for type checking |
| **Event queue** | **No broker.** The queue is the log: an event is an appended line, a consumer is a cursor in the log |
| **Wake-up** | Direct in-process wake-up for what the runtime produces itself; a 1 s watch of the log for what another process writes in it; a periodic tick for GitHub |
| **GitHub** | **Polling** (`gh api`, conditional requests) at milestone 1. The webhook will come as one more producer, changing nothing for the consumers |
| **Log storage** | **SQLite confirmed**, one file per project, WAL mode, append-only events table |
| **Per-project lock** | A write transaction held on a dedicated SQLite file: the kernel releases it when the process dies |
| **Driving `claude`** | Subprocess, **JSON stream over pipes, no pty**, in its own process group |
| **Deployment** | One **systemd** unit per project (`brigade@<project>.service`), code deployed by `git`, state in a single directory |
| **Dev workstation** | macOS: code is written there and tests are run there. No daemon runs on it |

## What was tried out before writing

Measured on 2026-10-08 on the Mac (Node 26.8.1, `claude` 2.1.285), with small throwaway scripts —
none is versioned, the PR contains only this document.

- `node file.ts` and `node --test` run TypeScript with no option or build; a complete SQLite
  test passes in 53 ms.
- `node:sqlite` (embedded SQLite 3.53.4): WAL mode, `STRICT` table, triggers that refuse
  `UPDATE` and `DELETE`, and a second process that reads while a write is in progress. No
  "experimental" warning.
- **Lock**: one process holds `BEGIN IMMEDIATE` on a file; the second gets
  `database is locked` immediately; after a `kill -9` of the first, the lock is taken again with
  no cleanup at all.
- **`claude` over pipes**: `claude -p … --output-format stream-json --verbose`, input
  closed, output read line by line — no pty needed. The stream ends with a `result` event
  (`subtype`, `is_error`, `terminal_reason`, `num_turns`, `usage`), exit code 0.
- **The stream carries the quota state**: a `rate_limit_event` gives `status`, `rateLimitType`,
  `resetsAt` and the utilization rate of the 5-hour and 7-day windows.
- **Forced stop**: a child launched `detached` leads its own group; `SIGTERM` then `SIGKILL`
  on the group also kills a grandchild that ignores `SIGTERM`.

**Not tried out**, for lack of access to the box from this session: its system, the presence of
systemd, the Node version installed there. See "To verify".

## 1. Language: TypeScript on Node 26, with no build

The runtime does four things: keep a log, supervise long subprocesses, read JSON as a stream,
talk to GitHub. Node does all four with its standard library, and since `node:sqlite` and type
stripping are built in, it does them **without a single installed dependency** — which matters
here more than elsewhere: one worktree per cook, gates replayed at every stop, a container per
project to come.

Three reasons to prefer TypeScript over a statically-linked-binary language:

1. **The event types are the system's contract.** "Everything is rebuilt from the log" rests on
   functions that fold the sequence of events; a discriminated union, checked exhaustively, turns
   a forgotten event type into a compile error rather than a wrong state at restart.
2. **These types will be used twice more.** The second's MCP endpoint (milestone 5) and the
   dashboard interface (milestone 6) handle the same events. Whatever desktop shell is chosen
   later, its interface will be web and its terminal will be xterm.js: TypeScript in every case.
   This observation does not settle the shell.
3. **The `claude` stream is line-by-line JSON**: Node's home ground.

**Rules that follow**

- **Erasable-only** syntax (no `enum`, no parameter properties, imports with the `.ts`
  extension): this is the condition for Node to run the sources as they are.
- `tsc --noEmit` serves as the type check in the gates and produces nothing. Its configuration
  is to be set by #13; it was not tried out here.
- Any runtime dependency added later is justified in its PR. Native modules that need compiling
  are to be avoided: they complicate the container and the worktree setup.
- Version: **Node 26**, the dev workstation's, which becomes LTS at the end of October 2026
  according to Node's schedule. `engines` requires it, the box installs it.

## 2. Event queue and wake-up: the log is the queue

A broker (Redis, NATS, RabbitMQ) would be a second daemon to operate and, above all, a **second
place where state lives** — the exact opposite of "no in-memory state". The log already exists
and is transactional: it is enough.

- **Producing** an event = appending a line to the log.
- **Consuming** = reading the log from a **cursor** (the number of the last event processed),
  itself stored in the database. A consumer advances its cursor **in the same transaction**
  as the events it produces in reaction: a crash in the middle loses nothing and replays
  nothing by halves.
- **Effects on the world** (launching a cook, merging) are not transactional. They are written
  in two steps — the intent, then the result. At restart, an intent with no result is to be
  reconciled. This is what makes "what was in progress is found again" true.

**Where each wake-up comes from**

| Event | Producer | Wake-up |
|---|---|---|
| Ticket end, cook signal, quota exhaustion | The engine adapter, in the runtime | Immediate, direct in-process call |
| Chef command (`stop`, later the grants) | The `brigade` CLI, another process, writes into the same log | The runtime watches `PRAGMA data_version` every second: latency ≤ 1 s |
| GitHub activity (ticket posted, CI finished, PR merged) | `gh api` polling on the tick, 60 s by default | On the tick |
| Tick | A runtime timer | — |

**GitHub: polling first, webhook after.** A webhook requires a public HTTP entry point on the
box, with TLS and signature verification: an attack surface that nothing else asks for at
milestone 1. With a single project and a single cook, a minute of latency costs nothing,
and conditional requests that answer "unchanged" do not consume the API quota.
Each GitHub event enters the log under a **unique key** (its GitHub identifier): the
webhook receiver, when it comes — naturally with the milestone 7 GitHub App —, will write
the same lines; duplicates will be refused by the database and the consumers will not
change. The tick then remains as a catch-up net.

**No network listening at milestone 1.** No port, no socket: the CLI reads and writes directly in
the database. The first port arrives with the app's API and the MCP (milestones 5 and 6).

## 3. Log storage: SQLite, confirmed

- **One file per project**: `<state directory>/log.db`. A project's state directory is
  thus a self-contained unit, mountable as is in its container (milestone 7). The scheduler
  (milestone 4) and the kitchen (milestone 6) will read several files; the shape of the global
  storage is theirs to decide.
- **Append-only.** An `events` table: sequence number, timestamp, project, ticket, type,
  author, JSON payload. Triggers refuse `UPDATE` and `DELETE`. The sequence number is the
  order of truth.
- **All derived state is recomputed.** Rail, leases, cook state are projections of the log:
  either folded at startup, or materialized in tables written in the same
  transaction as the event. In both cases, erasing them and replaying the log must give back
  the same state — this is a test that #13 must carry.
- **"Lend only once" (#14)** rests on the serialization of writes: check and
  append in a single `BEGIN IMMEDIATE` transaction.
- **WAL mode, `synchronous = FULL`**: readers (the CLI) do not block the writer, and a
  committed event survives a power cut. The volume does not justify trading
  durability for throughput.
- **A cook's raw stream does not go into the database.** It is written to `runs/<run>.jsonl` in
  the state directory; the log keeps the facts (launched, finished, failed, 86, stopped by a
  guardrail) and the file's path. Nothing needed to rebuild state lives in those files.

**Per-project lock.** Node has no `flock` in its standard library. The lock is therefore a write
transaction **held for the whole life of the process** on a dedicated SQLite file,
`lock.db`, separate from the log so as not to block the CLI. The second runtime fails immediately
and says who holds the lock — it reads this in the last startup event of the log. Since the
lock belongs to the kernel, a crash or a `kill -9` releases it: never an orphan lock to
clean up by hand. Condition: the state directory is on a **local disk**, not on a network
mount.

## 4. Driving `claude`

The adapter launches the **official `claude` binary**, found in the `PATH`, authenticated by the
Max connection already made on the machine. No Agent SDK, no API, no reading of the
credentials.

- **Launch**: `claude -p --output-format stream-json --verbose`, in the cook's worktree,
  input closed, output and errors on pipes, `detached` to make it a process group.
- **Reading**: one line = one JSON event. Each line resets the **idle** timer (#16).
- **Stop**: `SIGTERM` to the group, then `SIGKILL` after a grace delay. It is the same gesture
  for an exceeded cap, idleness, and the `stop` command.
- **The three endings (#15)** are read from three signals: the exit code, the final `result`
  event (`subtype`, `is_error`, `terminal_reason`) and the `rate_limit_event`s. The latter
  give `resetsAt`, hence the "moment the quota returns" that #15 wants to show.
- **Caps (#16)**: turns and tokens are counted in the stream (`num_turns`, `usage`); the
  duration is a runtime timer.

Left to be established by #15, because it can only be observed by provoking it: the exact shape
of the stream when the quota is **actually** exhausted, and when the Max connection has expired.

**A cook dies with the runtime.** Cooks are children of the runtime; stopping the service
stops them. At restart, a launch with no end in the log is logged as "interrupted" and
the ticket goes back to queued. What the cook had committed in its worktree stays. Making a cook
survive a runtime restart would cost one more supervisor, for a gain that milestone 1 does not
ask for.

**Test double.** The binary's path is overridden by `BRIGADE_CLAUDE_BIN`. Tests
point to a fake `claude` that replays a recorded stream: the gates consume
**no quota** and cover the endings that cannot be provoked on demand (86, expired
connection, silent cook). This variable is never set on the box.

## 5. Local dev, tests, isolation — what #22 needs

Proposed location of the code: `runtime/` at the root, with its `package.json`. It is for #22 to
declare the zone.

| Need | Command |
|---|---|
| Prepare a worktree | `npm ci --prefix runtime` (two dev dependencies, nothing else) |
| **Run the tests** | `npm --prefix runtime test` → `node --test` |
| Check the types | `npm --prefix runtime run typecheck` → `tsc --noEmit` |
| Run the runtime locally | `npm --prefix runtime start` |

Tests depend on no installed package: `node --test` passes on a bare clone. Only the type check
needs the `npm ci`.

**State isolation: a single variable.** `BRIGADE_STATE_DIR` designates the directory that
contains everything — `log.db`, `lock.db`, `runs/`.

- On the box: `/var/lib/brigade/<project>`.
- In a dev worktree: `<WT>/.brigade-state`, exported by `worktree-setup.sh` and ignored
  by git. Two worktrees have two directories, hence two databases and two locks.
- **In tests: never the variable.** Each test creates its own temporary directory.
  Two tests of the same worktree do not cross each other either, and a suite cannot damage
  the state of a runtime started by hand.

**Ports: none at milestone 1.** Nothing to assign, nothing to make collide. When a port
arrives, the rule is already set: `BRIGADE_PORT`, derived from the issue number by
`worktree-setup.sh`, and tests always listen on port 0, assigned by the system.

**Gate duration**: on the order of a second as long as the suite stays free of network and real
`claude`. This is a constraint to hold, not a coincidence: the `Stop` hook replays the gates at
every stop.

## 6. Deployment on the parade-box

One **system** systemd unit, templated, one instance per project: `brigade@<project>.service`.
The unit file is versioned with the runtime.

- **Account**: `User=` the Unix account that made the Max connection. The runtime thus reads the
  credentials where `claude` expects them, without copying them.
- **State**: `StateDirectory=brigade/%i` creates `/var/lib/brigade/<project>` with the right
  owner; `Environment=BRIGADE_STATE_DIR=…` designates it.
- **Code**: a clone of the repository on a published ref. With no runtime dependency or build,
  updating comes down to `git fetch`, `git checkout <tag>`, then restarting the service.

| Gesture | Command |
|---|---|
| Start | `systemctl start brigade@<project>` |
| Stop | `systemctl stop brigade@<project>` — also stops the cooks (same cgroup): this is the last-resort "stop", which works even if the runtime no longer answers |
| Monitor | `systemctl status brigade@<project>`; `journalctl -u brigade@<project> -f` for the process output; `brigade status` (#18) for the business state, read from the log |
| Restart after a crash | `Restart=on-failure`, with a restart delay |
| Restart after a reboot | `systemctl enable brigade@<project>` (`WantedBy=multi-user.target`) |

Two logs, two uses: **journald** keeps what the process prints (startup, errors,
traces); **the log** keeps what happened in the kitchen. Nothing is rebuilt from
journald.

**No prod access**: the unit mounts no prod secret and the runtime knows none.

**The container per project (milestone 7) stays open.** Nothing forbids it: no native module,
all state in a directory that becomes a volume, no imposed port, and a file lock
that stays valid between the host and a container of the same kernel. Whether the runtime runs
in the container or is driven from outside is a milestone 7 decision.

## 7. What runs where

| | Mac (dev workstation) | parade-box |
|---|---|---|
| Write the code, run the gates | yes | no |
| Runtime tests | yes, fake `claude` | no |
| Runtime as a service | no — started by hand to try, state in the worktree | yes, under systemd |
| Real cooks | by hand only | yes |
| systemd | absent | yes |

Consequence for the code: nothing Linux-specific outside the unit file. Process groups,
signals, SQLite and pipes behave the same on both systems; this is what lets the
gates run on the Mac hold for the box.

## Ruled out, and why

| Option | Reason |
|---|---|
| **Go** | The best deployment (one binary) and a native `flock`. But SQLite needs a third-party module there, the toolchain has to be installed on the Mac and in every worktree, and the event types would have to be rewritten for the MCP and the interface |
| **Python** | The standard library would suffice (`sqlite3`, `flock`, `subprocess`). But the Mac's Python is a system 3.9.6, serious typing needs one more tool, and nothing is shared with the rest |
| **Bun, Deno** | SQLite and TypeScript built in too. One more runtime to install on two machines, for nothing Node 26 does not already bring |
| **Rust** | Iteration too slow for a system whose shape is still being sought, with no measurable gain here |
| **Compiled TypeScript** (`tsc`, bundler) | A build step in every worktree and every deployment, now useless |
| **Untyped JavaScript** | Loses the exhaustive checking of events, which is the reason for the choice |
| **Agent SDK** | Forbidden by the spec: it requires an API key |
| **pty** (`node-pty`) | Native module to compile, and useless: `claude -p` speaks over pipes. The pty will come back with the app's terminal, which is not the runtime |
| **Broker** (Redis, NATS, RabbitMQ) | One more daemon and one more state, when the log already acts as a queue |
| **GitHub webhook from milestone 1** | A public entry point on the box to gain a minute of latency |
| **Postgres** | A server to operate, a database to create per worktree, for a single writer and a tiny volume |
| **JSONL files as the log** | Neither transaction nor uniqueness constraint: "lend only once" cannot be guaranteed there |
| **`better-sqlite3`** | Native module, next to a built-in equivalent. Remains the fallback if `node:sqlite` proved insufficient: the API is close, provided database access is isolated in a single module |
| **PID file lock** | A PID gets reused: orphan lock or false positive after a crash |
| **Cooks as separate systemd units** | Would make them survive the runtime, at the cost of a Linux-specific mechanism, hence impossible to test on the Mac |
| **User systemd service** (`--user` and `linger`) | Works, but boot-time startup depends on a session setting that is easy to forget |
| **systemd watchdog** (`WatchdogSec`) | Node cannot write to the notification socket without a dependency. A frozen runtime shows in the age of its last tick in `brigade status` |

## To verify at the first line of #13

These points could not be checked from this session; none calls the decision into
question, but each can cost an hour if discovered late.

1. The box does run Linux with systemd.
2. Node 26 is installed there, or installable without touching the rest.
3. `claude` there is the official binary, connected, and launched by the account that `User=` will designate.
4. `/var/lib` is on a local disk.
