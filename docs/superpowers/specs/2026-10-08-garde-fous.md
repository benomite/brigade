# Guardrails — spec and plan (#16)

**Date**: 2026-10-08
**Status**: validated on 2026-10-08 — the chef chose (a) on the six questions at the end of the document
**Issue**: #16 "The guardrails stop a cook that goes off the rails"
**Builds on**: `2026-10-08-runtime-stack.md` (§2 wake-up, §4 stop, inactivity, caps) and
`2026-10-08-runtime-journal.md` (extension rule). This document redecides nothing that appears
there.

---

## What #16 delivers

The mechanical supervision of a cook, **before** a real cook exists (#15): #16's code supervises
any subprocess. The tests drive it with a fake `claude` (`BRIGADE_CLAUDE_BIN`); no quota is
consumed.

| Issue criterion | What carries it |
|---|---|
| A cap per ticket (turns, duration, tokens) exists and the chef can see it | The settings in force are logged at startup (`guard.configured`) and repeated in each launch; reading surface: **question 6** |
| A cook that exceeds its cap is stopped; the ticket goes back to queued with the reason in the log | The supervisor counts in the stream, stops the process group, logs the stop and its reason on the ticket |
| A cook silent for N minutes is detected and stopped | Timer reset by each line of the stream |
| After N failures in a row, the runtime stops launching cooks and tells the chef | Breaker: a projection of the log, consulted by the launch itself |
| A "stop" command stops all cooks, immediately | The CLI writes the fact in the log; the runtime sees it within 1 s (log watch) |
| Each stop is logged with its reason | One fact per stop, carried by the ticket: it can be reread with `npm run log -- <ticket>` |

## Modules

Following #13's extension rule: one file per domain, one line in `evenements.ts` and in
`projections.ts`.

```
runtime/src/
  evenements/garde-fous.ts    the domain's facts
  projections/garde-fous.ts   cooks in flight, breaker, stop requested
  superviseur.ts              launches a subprocess in its group, reads its stream, counts, stops — without the log
  garde-fous.ts               wires it all to the runtime: guarded launch, listening for "stop"
  plafonds.ts                 reads the settings in the environment, default values
  garde-fous-cli.ts           `npm run guardrails`: see, stop, resume
  main.ts                     one line: the runtime starts with its guardrails
runtime/test/
  aides/faux-claude.sh        stand-in (launched as `claude`): silent, and the scenarios that end by themselves
  aides/faux-claude.ts        its scenarios that live on: endlessly chatty, grandchild deaf to SIGTERM, waiting for the test
```

## Logged facts

| Fact | Author | Ticket | Payload |
|---|---|---|---|
| `guard.configured` | `runtime` | no | `limits`, `breakerThreshold` — written at startup when the settings have changed |
| `cook.launched` | `runtime` | yes | `run`, `limits` (`turns`, `durationMs`, `tokens`, `idleMs`), `stream` (path of `runs/<run>.jsonl`, relative to the state directory) |
| `cook.exited` | `runtime` | yes | `run`, `outcome`, `code`, `signal`, `turns`, `tokens`, `durationMs`, `error` if it could not be launched — the end of the process, whatever the cause |
| `guard.tripped` | `runtime` | yes | `run`, `reason` (`turns` \| `duration` \| `tokens` \| `idle` \| `stop`), `limit`, `observed` — **the reason for the stop** |
| `cook.interrupted` | `runtime` | yes | `run` — written at startup for a launch with no end (the cook died with the runtime) |
| `kitchen.stopped` | `chef` | no | — the "stop" command |
| `kitchen.resumed` | `chef` | no | — the "resume" command |
| `breaker.opened` | `runtime` | no | `failures`, `threshold` |

`outcome` says what the end is worth for the breaker: `ok`, `failed`, `guard` (stopped by a cap or
by inactivity), `stop` (stopped by the chef), `neutral` (neither: the 86, which #15's station
recognizes and declares at the guarded launch).

Intent and result are written in two steps (§2 of the stack): `cook.launched` before the
subprocess exists — so its pid does not appear in it —, `cook.exited` when the process dies.
`guard.tripped` is written **before** the signal: if the runtime dies between the two, the reason
is already in the log.

**The cook's raw stream** goes into `runs/<run>.jsonl`, not into the database (§3 of the stack).

## The supervisor

- **Launch**: `spawn` `detached` (the cook leads its own group), input closed, output and errors
  on pipes.
- **Counting**: each line of the stream is JSON. Turns and tokens are read in the assistant's
  messages (`usage`) as they come — not in the final `result`, which arrives too late to stop
  anything. One turn = one assistant message, recognized by its identifier: `claude` delivers it
  in several lines that repeat its usage. An unreadable line counts as activity, nothing more.
- **Nothing outlives its cook**: when the process dies, what remains of its group is killed.
- **Three timers**: total duration, inactivity (reset by each line), grace after `SIGTERM`.
- **Stop**: `SIGTERM` to the group, then `SIGKILL` to the group after the grace delay. The same
  gesture for a cap, inactivity and the "stop".
- **All delays are injectable**: the tests run in milliseconds.

## Breaker and "stop"

Both are **projections of the log**: they survive a restart and are recomputed by replay. The
guarded launch consults them in the transaction that writes `cook.launched`: breaker open or
kitchen stopped → refusal, with no subprocess.

- The count of failures in a row advances and resets according to **question 3**.
- The "stop": the CLI writes `kitchen.stopped`; the log watch wakes the runtime, which stops each
  cook in flight with the reason `stop`.
- **A cook dies with the runtime**: on shutdown, cooks are killed without writing anything; the
  next startup notes `cook.interrupted` on their ticket. Limit: after a `kill -9` of the runtime
  outside systemd (dev workstation), a cook may outlive it — on the box, the unit's cgroup wins.

## Boundaries with neighboring tickets

- **#14 (rail)**: #16 does not touch ticket state. "The ticket goes back to queued" is read, on
  the rail side, on `cook.exited` / `cook.interrupted` carried by the ticket. The name of the fact
  the rail listens to is to be agreed with #14.
- **#15 (station)**: calls #16's guarded launch instead of `spawn`, and interprets the three
  endings (done, failed, 86) from `cook.exited` and the stream. #16 does not judge the end of a
  cook it did not stop itself.
- **#18 (state)**: will take over the reading surface in `brigade status`.
- **Loop detection** (cited by the V2 spec, absent from the issue's criteria): covered at
  milestone 1 by the turns cap. Nothing finer here.
- **Live consumed budget**: the log carries consumption at the end of the cook, not at each turn.
  Displaying it along the way belongs to #18.

## Plan

Each step in TDD (`superpowers:test-driven-development`). The suite stays on the order of a
second.

1. Facts and projection: cooks in flight, breaker, stop requested — replay test included (the
   registry enters it by itself).
2. Fake `claude` and supervisor: normal end, raw stream in `runs/`, counters.
3. Caps: turns, tokens, duration, inactivity — each stops and logs its reason.
4. Forced stop: grandchild deaf to `SIGTERM` killed with the group.
5. Breaker: N failures in a row → `breaker.opened`, launch refused; persists across restart.
6. "stop" written by another process → all cooks stopped within 1 s; "resume".
7. Reconciliation at startup: launch with no end → `cook.interrupted`.
8. Chef's surface (question 6), `docs/runtime.md`.

## Questions settled — (a) on all six, on 2026-10-08

Questions 1 to 5 by the chef; 6 by precedent of #13. The hypothesis "loop detection = turns cap"
is accepted.

**1. Which default values, and where are they set?**
- **Recommended**: 100 turns, 60 min, 2 M tokens, inactivity 10 min, breaker at 3 failures. The
  same caps for all tickets at milestone 1, adjustable through environment variables of the
  systemd unit (`BRIGADE_MAX_TURNS`, `BRIGADE_MAX_MINUTES`, `BRIGADE_MAX_TOKENS`,
  `BRIGADE_IDLE_MINUTES`, `BRIGADE_BREAKER_FAILURES`). A cap specific to a ticket will come with
  the ticket format.

**2. What does the tokens cap count?**
- **(a) — recommended**: input + output + cache write, **excluding cache reads**. Cache reads
  inflate the total by an order of magnitude without reflecting the cook's work.
- (b): everything `usage` reports, cache reads included.
- (c): output alone.

**3. What counts as a failure for the breaker?**
- **(a) — recommended**: a stop by guardrail (cap, inactivity) and a cook that fails (non-zero
  exit code). **Not** counted: the chef's "stop", the 86, the interruption by a runtime restart. A
  cook that ends well resets the counter to zero.
- (b): only stops by guardrail count.

**4. How does the breaker close again?**
- **(a) — recommended**: only by a chef command ("resume"). It stays open after a runtime
  restart.
- (b): by itself after a delay.

**5. After a "stop", does the runtime launch cooks again?**
- **(a) — recommended**: no. The "stop" is a state: nothing launches until the chef has said
  "resume" (the same command as for the breaker). It holds after a restart.
- (b): yes. The "stop" kills the cooks in flight and that is all; the rail relaunches right away.

**6. Where does the chef see and command, until #18 is delivered?**
- **(a) — recommended**, on the model of #13's `npm run log`:
  `npm --prefix runtime run guardrails` shows the caps, the cooks in flight, the state of the
  breaker and of the "stop", and the latest stops with their reason;
  `… run guardrails -- stop` and `… run guardrails -- resume` command. #18 will take them over in
  the `brigade` CLI.
- (b): #16 delivers only the facts in the log; the chef reads them with `npm run log` and waits
  for #18 to command.
