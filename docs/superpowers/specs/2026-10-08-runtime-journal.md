# Runtime and log — spec and plan (#13)

**Date**: 2026-10-08
**Status**: validated on 2026-10-08 — the chef settled (a) and (a) on the two questions at the end of the document
**Issue**: #13 "The runtime runs on the box and keeps its log"
**Builds on**: `2026-10-08-runtime-stack.md` (§1, §2, §3, §6), which already settled the stack.
This document redecides nothing of what appears there; it says what #13 lays down, and where.

---

## What #13 delivers

The base that #14, #16 and #18 rest on: a process that starts, holds a lock, writes to an
append-only log and stops cleanly. **No rail, no cook, no call to
`claude`** — so no quota consumed, by construction: #13's code launches no
subprocess.

| Issue criterion | What carries it |
|---|---|
| Start, stop, restart without losing state | durable `log.db` (WAL, `synchronous = FULL`); recomputable projections; reconciliation at startup |
| Every event carries timestamp, project, ticket, type, author | `NOT NULL` columns of the `events` table (except `ticket`, null for an event that concerns no ticket) |
| Reread a ticket's complete log, in order | Read by ticket, sorted by sequence number — surface for the chef: **question 1** |
| Two runtimes on one project: the second refuses and says why | `lock.db`, a write transaction held for the whole life of the process |
| No quota consumed | No subprocess, no network on this path |

## Modules

One module per responsibility, so that #14, #16 and #18 move forward in parallel without fighting
over a file.

```
runtime/
  package.json          scripts test / typecheck / start, engines Node 26, zero runtime dependencies
  package-lock.json     two dev dependencies: typescript, @types/node
  tsconfig.json         tsc --noEmit, erasable syntax only
  src/
    base.ts             ONLY module that imports node:sqlite — opening, pragmas, schema, transactions
    evenements.ts       the discriminated union of events, assembled from evenements/
    evenements/
      runtime.ts        the events that #13 produces
    journal.ts          append an event, read (by ticket, from a cursor), replay
    projection.ts       what a projection is, and what it takes to define one
    projections.ts      registry of projections
    projections/
      sessions.ts       the projection that #13 carries: the runtime's successive lives
    verrou.ts           lock.db
    runtime.ts          start / stop: lock, reconciliation, wake-up loop
    main.ts             entry point of `npm start`: environment, signals, exit code
    relire.ts           `npm run log`: rereading the log, read-only
  test/                 node --test, one temporary directory per test
  deploy/
    brigade@.service    templated systemd unit
docs/runtime.md         living doc: run locally, deploy on the box, the chef's acceptance recipe
```

**Extension rule** (what the following tickets do, and nothing else): a domain adds
`evenements/<domaine>.ts` and `projections/<domaine>.ts`, then **one line** in `evenements.ts`
and in the registry of `projections.ts`. A projection declares the facts it listens to and must
handle every type of them: forgetting one is a `tsc` error.

## The log

`events` table, `STRICT`, append-only (triggers that refuse `UPDATE` and `DELETE`):

| Column | Meaning |
|---|---|
| `seq` | sequence number, increasing primary key — **the order of truth** |
| `at` | ISO 8601 UTC timestamp, set by the runtime at write time |
| `project` | the project |
| `ticket` | the ticket's number, or `NULL` |
| `type` | event type (`runtime.started`…) |
| `author` | who wrote it: `runtime`, `chef`, later `station:<name>`, `cook:<run>` |
| `payload` | JSON payload |
| `dedup_key` | optional uniqueness key (`UNIQUE`) — for external producers (#14: GitHub identifier). A duplicate is refused without error |

The names of columns and event types are in English, like the vocabulary of the V2 spec
(rail, ticket, pass, cook); the code and its comments stay in French.

**Events of #13**: `runtime.started` (pid, host, Node version), `runtime.stopped`
(requested stop: signal received), `runtime.interrupted` (written at the next startup when the
previous life has no `stopped`: crash, `kill -9`, power cut).

**Cursors**: `cursors` table (consumer → last `seq` handled), advanced in the same
transaction as the events produced in reaction (§2 of the stack). #13 lays down the table and the
primitive; its first consumers arrive with #14.

## Projections and replay

A projection = a name, the tables it owns, and an `appliquer(événement)` function
called **in the transaction that appends the event**. `reconstruire()` empties all the projection
tables and replays the log from `seq = 1`. The runtime does it **at every startup**: a
projection added by a later ticket thus fills itself with everything written before it,
with no migration.

Tests that #13 carries:

- **Replay**: after a series of events, the state of the projections is photographed; we
  rebuild; the state is identical. The test walks **the registry**, so any projection
  added by a later ticket enters it without thinking about it.
- **Restart**: a runtime starts, writes, is killed (`kill -9` on a real child process);
  the next one finds the log intact, logs `runtime.interrupted`, and starts again.
- **Lock**: a second runtime on the same state directory fails immediately, non-zero exit
  code, with a message that names the holder (pid, host, start time, read from
  the last `runtime.started`).

## Runtime

- **Environment**: `BRIGADE_STATE_DIR` (mandatory, never a default: no hard-coded path) and
  `BRIGADE_PROJECT` (mandatory). Absent → refuses to start, clear message.
- **Startup**: lock → opening the log → replaying projections → reconciliation (`interrupted` if needed) →
  `runtime.started` → loop.
- **Wake-up loop**: watching `PRAGMA data_version` every second (what another
  process writes) and a tick every 60 s. At #13's milestone nobody listens yet: the loop delivers the
  subscription mechanism that #14 and #16 will plug into. The intervals are injectable, so that
  tests do not sleep.
- **Stop**: `SIGTERM` / `SIGINT` → `runtime.stopped` → closing → exit code 0. systemd sends
  `SIGTERM` on `systemctl stop`.
- **Process output**: a few lines on stdout (started, stopped, refusal) — it is journald
  that keeps them on the box. Nothing that serves to rebuild the state goes through there.

**Left to #18**: the "age of the last tick" that reveals a frozen runtime. The tick is not
logged by #13 — 1,440 lines a day that say nothing about the kitchen; how to make it
visible belongs to the ticket that displays it.

## Deployment

`runtime/deploy/brigade@.service`, compliant with §6 of the stack: `User=`, `StateDirectory=brigade/%i`,
`Environment=BRIGADE_STATE_DIR=/var/lib/brigade/%i`, `Environment=BRIGADE_PROJECT=%i`,
`Restart=on-failure` with a delay, `WantedBy=multi-user.target`. `docs/runtime.md` gives the
installation procedure and the **chef's acceptance recipe** — the criterion "the chef starts the runtime on
the box" can only be proved there; the dev session has no access to it. The four "to
verify" points of the stack (Linux + systemd, Node 26, `claude` logged in under `User=`, local
`/var/lib`) open this recipe.

## Plan

1. `package.json`, `tsconfig.json`, `package-lock.json` — `npm test` and `typecheck` green when empty.
2. `base.ts` + `journal.ts`: schema, append-only proved (an `UPDATE` and a `DELETE` refused),
   mandatory fields, read by ticket in order, uniqueness key.
3. `projections.ts` + `projections/sessions.ts` + replay test.
4. `verrou.ts`: second taker refused; lock taken back after `kill -9`.
5. `runtime.ts` + `main.ts`: startup, clean stop, reconciled interruption, refusal of the second
   with its reason — tests on real child processes.
6. Surface for rereading the log (according to the answer to question 1).
7. systemd unit, `docs/runtime.md`.

Each step in TDD (`superpowers:test-driven-development`). The suite stays on the order of a
second.

## Questions settled — (a) and (a), by the chef, on 2026-10-08

**1. Where does the chef reread a ticket's log, as long as #18 is not delivered?**
The criterion says "the chef can reread a ticket's complete log"; the qualification puts the
status CLI out of scope (#18).

- **(a) — recommended**: #13 delivers a minimal read-only command,
  `npm --prefix runtime run log -- <ticket>` (one line per event: `seq`, time, type,
  author, payload; with no argument, the whole log). #18 will take it over into `brigade status`
  and add states, cooks and live following. #13's criterion is thus met by #13.
- (b): #13 delivers only the read function, proved by test; the chef waits for #18 to use
  it, and the criterion is only accepted at that point.

**2. What is the project name?** It is written in every event, in the name of the systemd
unit (`brigade@<project>`) and in the state path (`/var/lib/brigade/<project>`).

- **(a) — recommended**: a short identifier chosen by the chef (`brigade`, `thermigo`),
  limited to `[a-z0-9-]`. The link to the GitHub repository (`owner/repo`) is a setting that
  #14 will lay down when the rail needs it.
- (b): `owner/repo` directly — unambiguous, but the slash must be escaped
  in the systemd unit name and in the state path.
