# The kitchen's state — spec and plan (#18)

**Date**: 2026-10-08
**Status**: validated on 2026-10-08 — the chef settled (a) on questions 1 and 2, tick masking included, and accepted the form of question 3
**Issue**: #18 "The chef sees the kitchen's state without opening the database"
**Builds on**: `2026-10-08-runtime-stack.md` (§2 wake-up, §3 projections, §6 `brigade status`),
`2026-10-08-runtime-journal.md` (extension rule), `2026-10-08-runtime-rail.md` and
`2026-10-08-garde-fous.md`. This document redecides nothing of what appears there.

---

## What #18 delivers

A read command, for one project — that is, for one state directory. Just enough to
steer milestone 1: not a dashboard.

| Issue criterion | What carries it |
|---|---|
| Tickets by state, active cooks with their ticket and their consumed budget, the latest events | `npm --prefix runtime run status`: a photo, read from the rail, guardrails and sessions projections, and from the events table |
| It answers immediately, even while cooks run | Log opened read-only: in WAL mode a reader never waits for the writer, and does not block it |
| The chef can follow the log live, from the rail to the verdict | `status -- --follow [<ticket>]`: the photo, then each event as it is written, seen through `PRAGMA data_version` |
| All the display derives from the log | No display table, no file read outside `log.db`. What the log did not yet say — the tick, the consumption of a running cook — enters it as **facts**: `runtime.ticked` and `cook.progressed` |

## What the command shows

The example output and the reading of each block are in `docs/runtime.md`, "L'état de la cuisine".

- **Runtime**: running (session with no end in the log), stopped (`runtime.stopped`) or never
  started. The tick line is **always** displayed when a session is open: it is what
  reveals a runtime that is frozen or dead without warning. The command shows the age and the expected
  rate; it does not conclude — "who is stuck" is milestone 6.
- **Rail**: the count by state, then the tickets in service order. Durations are
  relative to the time of the command; the exact timestamp stays in `run rail`.
- **Cooks**: one per launch with no end, with its ticket and its consumption against its caps.
- **Latest events**: the last 15, in log order — the most recent at the bottom, where
  following continues —, in the format of `run log` (the formatter is shared, not copied). Neither
  ticks nor the cooks' readings appear there: the header and each cook's line summarize them,
  and one per minute would drown the rest.

`--follow` displays the photo, then adds one line per new event, in log order,
until Ctrl-C. With a ticket number, only that ticket's events scroll by. The cooks' readings
scroll by (it is the sign of life of a cook being followed), ticks do not. The watch is that
of the runtime, tighter: `PRAGMA data_version` four times a second, then reading the
events after the last sequence number read — nothing is skipped.

Errors, like the other commands: `BRIGADE_STATE_DIR` absent or unknown argument → code 2 and
the usage; no log, or log of a runtime from before these projections → code 1 and the reason.

## Modules

```
runtime/src/
  evenements/runtime.ts       + runtime.ticked (`intervalMs`: the expected rate)
  evenements/garde-fous.ts    + cook.progressed (`run`, `turns`, `tokens`)
  projections/sessions.ts     + runtime_tick table: the last tick
  projections/garde-fous.ts   + cook_progress table: the last reading of each cook
  journal.ts                  + the last N events, the last sequence number
  relire.ts                   masks ticks without argument; `--ticks` shows them
  runtime.ts                  the tick is written to the log before waking the listeners
  superviseur.ts              + mesure(): turns and tokens counted so far
  garde-fous.ts               at the tick, one measure per running cook
  ligne-evenement.ts          the formatter of an event line, pulled out of relire.ts
  etat.ts                     reads the state from the projections, describes it line by line (time injected), follows the log
  status.ts                   `npm run status`: arguments, display, signals
```

The two new tables belong to the existing projections and are recomputed from the log
like the rest. Tables rather than columns: `CREATE TABLE IF NOT EXISTS` lays them on a log
already in service, where an added column would not be.

## Boundaries

- **#15 (claude station)**: `status` does not need a real cook to exist; the tests go through
  the guarded launch and the fake `claude`. Shared files expected: `package.json` (one line of
  script) and `docs/runtime.md` (one section). #18 also touches `superviseur.ts` and `garde-fous.ts`
  — the `mesure()` method and the reading at the tick, nothing else, without changing what #15 calls.
- **Out of scope**, as the issue says: multi-project, live view of a cook, web access, detection of
  "who is stuck" and alerts.

## Plan

TDD, a red test before each step.

1. `ligne-evenement.ts` extracted from `relire.ts`, without changing any output.
2. The tick in the log and in the sessions projection (according to question 1).
3. The measure of a running cook in the log and in the guardrails projection (according to question 2).
4. `etat.ts`: the photo, tested on hand-built logs.
5. `status.ts`: photo, then `--follow`, tested in a real process while another writes.
6. `docs/runtime.md`: the command, how to read it, two lines of acceptance recipe.

## Questions settled — (a), (a), form accepted, on 2026-10-08

### 1. Where does the age of the last tick come from?

Today the tick wakes the runtime but **writes nothing**: the log cannot say when
it happened.

- **(a) A `runtime.ticked` fact per tick** — recommended. The only option where the age
  truly derives from the log. Cost: one line per minute, that is 1,440 per day and around 50 MB per year and per
  project in a log that is never erased, replayed at every startup. `run log` with no
  argument would display them.
- **(b) A heartbeat outside the log**: a single line, rewritten at each tick, in `log.db`.
  No volume, but it is a state that does not derive from the log — the exception the issue forbids.
- **(c) A tick logged every N minutes** (5?): five times fewer lines, a frozen
  runtime seen five times later.

Sub-question settled: `run log` with no argument masks ticks; `--ticks` shows them.

### 2. What is "consumed budget" worth for a cook still running?

The log knows turns and tokens only at the end (`cook.exited`). During the cook, only the
**duration** can be deduced (time − `cook.launched`); the count lives in the supervisor's memory.

- **(a) A `cook.progressed` fact per running cook, at every tick** (`run`, `turns`, `tokens`) —
  recommended. The chef sees turns and tokens at most a minute late, and the age of the reading is
  displayed. Cost: one line per minute and per active cook; touches `superviseur.ts` and
  `garde-fous.ts`, neighbours of #15.
- **(b) The duration alone** at milestone 1, against the three caps; turns and tokens appear only at
  the end. Nothing more to write, but a cook that burns its tokens cannot be seen before it stops.
- **(c) Read `runs/<run>.jsonl`** to recount live: exact to the second, but it is
  computing elsewhere than in the log — dismissed by the issue.

### 3. Form of the command

Retained: `npm --prefix runtime run status`, and
`… run status -- --follow [<ticket>]`, in the line of `log`, `rail` and `guardrails`. The stack
spec speaks of `brigade status`: a real `brigade` binary that would group the four
commands would be another ticket.
