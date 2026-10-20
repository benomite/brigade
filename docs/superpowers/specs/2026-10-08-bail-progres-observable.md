# A ticket's lease only renews on observable progress — spec and plan (#47)

**Date**: 2026-10-08
**Status**: approved on 2026-10-08 — the chef took the recommendation on the three questions at the end of the document
**Issue**: #47 "A ticket's lease only renews on observable progress"
**Builds on**: `2026-10-08-brigade-v2-design.md` (§"The lease renews on proof of
work"), `2026-10-08-runtime-rail.md` (the lease, `renouveler`, `relever`),
`2026-10-08-station-claude.md` (§Harvest), `2026-10-08-garde-fous.md` (idleness, `juger`)

---

## What #47 delivers

Today the station renews its ticket's lease on a timer: as long as the cook's process exists, the
ticket is held. A live cook that produces nothing therefore keeps its ticket until the duration
cap. #47 makes the connection left open by #15: **the lease only renews if the worktree
moved**, and a lease that lapses goes through harvest.

| Issue criterion | What carries it |
|---|---|
| What renews the lease is observable progress, never the cook's presence or what it says | The station compares the worktree's **fingerprint** from one observation to the next; `rail.renouveler` is only called if it changed. The output stream is not read |
| The lease plays on a longer scale than #16's idleness; the two coexist | Default lease raised from 10 to 30 min (question 1); idleness (10 min, on the stream) is not touched. A chatty, motionless cook drops at the lease; a silent cook drops at idleness |
| Trap: expiry goes through harvest | The station is the one that stops the cook when the lease lapses, by a **judged** stop (reason `lease`): `juger` harvests what is committed before the ticket is returned |
| Trap: neither `node_modules` nor `.git`, no log | The fingerprint is what git sees of the worktree: ignored files do not enter it (question 2) |
| Trap: tests on a simulated clock | The observation is played at the runtime's tick and reads the time through `maintenant`: the test advances the clock, no real delay |

**Out of scope**: the cap on the age of a lease with no progress and its display in `status` (#45).

## The worktree fingerprint

`Depot` gains a gesture, `empreinte(worktree): string` — an opaque string that changes only if the
worktree progressed:

- the head (`git rev-parse HEAD`): a commit, an amend, a rebase change it;
- `git status --porcelain -z --untracked-files=all`: tracked files modified, added, deleted,
  and untracked files that are **not ignored**;
- for each path this status cites, its size and modification date: rewriting a file that is
  already modified is progress, whereas its status line does not change.

Git draws the boundary: what `.gitignore` excludes does not appear, and `.git` is never walked.
The cost is that of a `git status`, paid per observation and not per tick (see below).

`git` is launched with `--no-optional-locks`: an ordinary `status` refreshes the index and takes
`index.lock`, which would make a cook's `git commit` fail if it fell at the same instant.

A fingerprint that cannot be read (worktree deleted, git failing) does not count as progress: the
station warns on journald and keeps the previous one. Nor does it count as an absence of
progress: at the deadline, the station rereads at every tick, and only stops the cook if the
worktree stays unreadable a tenth of a lease past the deadline. The output of `git status` is read with no cap on
size: a worktree loaded with new files is that of a cook that is writing.

## The station observes, then renews or stops

The renewal timer goes away. In its place, the station looks at its cook's worktree
**at the runtime's tick**, at most once per tenth of a lease (3 min for a 30 min lease) — and at every tick, without touching the worktree, it checks that it still holds the ticket:

1. starting fingerprint taken when the cook is launched;
2. at the observation, if the fingerprint changed: `rail.renouveler` — the deadline restarts from now.
   If refused, the ticket has left the rail: the cook is stopped ("stop", current behaviour);
3. if it did not change and the deadline has passed: the station stops the cook with the reason
   `lease`.

The reason `lease` joins `MotifArret`. It is a guardrail stop like any other: `guard.tripped`
writes it to the log before the signal (`limit` = the duration of the lease, `observed` = the time elapsed since
the last progress), and the end is **judged**, so harvested by #15's code with nothing changed in it:

| The worktree at the deadline | End | Ticket |
|---|---|---|
| carries commits | `ok` — `cook.reported` `done`, reason `harvested:guard:lease`; branch pushed, PR | in pass |
| carries none | `guard` — `cook.reported` `failed`, reason `guard:lease`; comment on the ticket | back to queued |

`CookLance.arreter` and `Supervise.arreter` take an optional reason for this; without it, it is
always the "stop".

### The rail does not return a ticket whose cook is running

`relever` today returns any taken ticket whose deadline has passed. It runs at every wake-up: it
would therefore go **before** the station, the ticket would go back to queued, and the harvest would arrive
too late to send it to pass — committed work would be redone by the next cook.

`relever` therefore leaves aside a ticket whose cook is in progress (projection `cook_runs`): it is
up to its station to stop it, to harvest, and to say what comes next. The safety net stays whole — a cook
always ends (duration cap), and any end with no follow-up already puts the ticket back to queued in the
rail's projection (#15). `lease-expired` is now only written for a taken ticket with no cook: a
station that died between the loan and the launch.

## What does not change

- #16's idleness, its caps, the breaker.
- #15's harvest: only what is **committed** goes to pass. Work written but not committed
  renews the lease as long as it advances; if it stops there, it stays on the station, on its branch.
- `BRIGADE_LEASE_SECONDS` remains the only setting; only its default changes.

## Plan

1. `depot.ts` — `empreinte`, tested on a real repo: stable with no change; changes on commit,
   modification of a tracked file, rewrite of an already modified file, untracked file; does not
   change for an ignored file.
2. `superviseur.ts`, `garde-fous.ts`, `evenements/garde-fous.ts` — reason `lease`, `arreter(motif?)`.
3. `rail.ts` — `relever` spares a ticket whose cook is running.
4. `station.ts` — observation at the tick, renewal on progress, stop at the deadline. Clock-driven tests:
   chatty motionless cook → stopped, ticket queued, no `ticket.renewed`; file
   touched → renewed; ignored file → not; commit then motionless → harvested, in pass.
5. `alimenter.ts` — default of the lease; `docs/runtime.md` — the lease, the settings table, the facts.

## Questions settled

**1. The duration of the lease.** Recommended: **30 min** by default (three times idleness, half the
duration cap), adjustable through `BRIGADE_LEASE_SECONDS`. A cook that reads for twenty minutes before
writing keeps its ticket.

**2. The boundary of "a touched file".** Recommended: **what git would see** — commit, tracked
file modified or deleted, untracked and non-ignored file. A non-ignored log counts: it is up to the
project's `.gitignore` to say so. A cook that rewrites the same file in a loop keeps its ticket
until the duration cap; #45 will bound it.

**3. The end of a cook whose lease lapses.** Recommended: harvested if it committed; otherwise a failure, which
**counts toward the breaker** like an idleness stop, and a comment on the ticket.
