# The age of a lease with no progress is capped, and visible — spec and plan (#45)

**Date**: 2026-10-08
**Status**: validated on 2026-10-08 — the three recommendations at the end of the document are kept (1 and 2 by the chef, 3 by the Manager)
**Issue**: #45 "The age of a lease with no progress is capped, and visible"
**Builds on**: `2026-10-08-brigade-v2-design.md` (§Guardrails, §Monitoring),
`2026-10-08-bail-progres-observable.md` (#47: the lease only renews on progress),
`2026-10-08-runtime-status.md` (`status`, "all display derives from the log")

---

## What #47 already set down, and what remains

#45 was written before #47 was designed. Since #47, the lease only renews if the
worktree moved, and a lease that falls stops the cook (`guard.tripped`, reason `lease`). Three of
#45's five criteria are thereby carried, in whole or in part:

| Issue criterion | State after #47 | What #45 adds |
|---|---|---|
| A cap on the age of a lease with no progress, distinct from the budgets | **Carried**: it is the lease duration (`BRIGADE_LEASE_SECONDS`, 30 min), outside `Plafonds` — neither turns, nor duration, nor tokens | Nothing, if question 1 keeps the recommendation |
| Overrun logged with its reason, distinct from inactivity | **Carried**: `guard.tripped`, `reason: "lease"` (≠ `idle`), `limit` = the lease, `observed` = the time with no progress | Nothing |
| `status` shows, per taken ticket, since when it has not progressed | Absent | The rail projection carries the **date of the last progress**; `status` and `rail` display it |
| Read, never deduced | Absent: the date only lives in the station's memory | It enters the projection, from the log's facts |
| Reported as stuck without being asked | **In part**: when the lease falls, the station already comments on the issue ("No progress in its worktree since …") | Depends on question 2 |

## The date of the last progress is a log fact

No new fact. Since #47, `ticket.renewed` is written **only** when the station saw the
worktree change: it is the progress fact. `cook.progressed` (#18) is not one — it records
turns and tokens at every tick, whether or not the cook advances — and the projection does not listen to it.

The rail projection gains a column, `progressed_at` (`progressedAt` in `TicketRail`):

| Fact | Effect |
|---|---|
| `ticket.taken` | `progressed_at` = the time of the take: a ticket just taken has nothing to be blamed for yet |
| `ticket.renewed` | `progressed_at` = the time of the fact |
| any fact that takes the ticket out of the "taken" state | `progressed_at` erased, like the lease |

Time still does not enter the projection: it carries a date, not a duration. The duration is
counted at display time, from that date to now — like "since 4 min" today. Nobody looks at a worktree
or a commit to get it.

**Precision**: the station looks at the worktree at most once per tenth of a lease. The date is
the one at which the progress was **seen**, hence at most three minutes behind the progress itself
(for a 30-minute lease). This is said in the doc, not corrected.

**Existing log**: the `rail` table changes shape. The runtime replays its projections at
startup; `status` on a log not yet replayed already answers "restart the runtime".
The error of a missing column (`no such column`) takes the same path as that of a missing
table.

## The display

`status`, line of a taken ticket — the second duration next to the first:

```
  #14  taken  prio:1  by box/claude since 42 min, no progress since 12 min, lease 18 min left  The rail carries the tickets
```

A ticket whose lease has expired and which is still taken has gone past the cap (unreadable worktree
in grace, frozen runtime, dead station): `status` marks it in capitals, like the open breaker.

```
  #14  taken  prio:1  by box/claude since 1 h 05, STUCK: no progress since 34 min, lease expired since 4 min  …
```

`rail` (the raw dates) gains `last progress <date>` on the same line.

## Plan

1. `projections/rail.ts` — column `progressed_at`, set by `ticket.taken` and `ticket.renewed`,
   erased elsewhere. Projection tests: take, renewal, exit from the "taken" state, identical
   replay; `cook.progressed` does not touch it.
2. `etat.ts` — the duration with no progress in `detail`, the `STUCK` mark when the lease has expired.
   Tests on `decrireEtat` at a supplied time.
3. `montrer-rail.ts` — the date of the last progress.
4. `status.ts` — a missing column says "restart the runtime", like a missing table.
5. `docs/runtime.md` — the rail, the `status` example, the table of blocks.

## Questions settled

**1. Is the cap the lease itself?** Recommended: **yes**. The V2 spec describes the same
mechanism in two places (§The manager: "the lease decides"; §Guardrails: "age of lease with no
progress, capped apart from the budgets"), and #47 delivered it: a cook with no progress loses its ticket at
30 min, reason `lease`, harvest included. #45 then adds **no** setting and no fact, and
comes down to making the duration readable. The other reading — a second, longer cap on the total age
of the lease — already exists too: it is the cook's duration cap (60 min).

Consequence to record: #47's spec said of a cook that rewrites the same file in a loop that
"#45 will bound it". With this reading, #45 does not bound it — rewriting a file is progress in
the sense of the fingerprint, and it is the duration cap that stops it.

**2. Is a signal needed before the lease falls?** Recommended: **no at milestone 1**. The "without
being asked" signal is then the one that exists: the station's comment on the issue
when the lease falls (the only pushed channel of milestone 1 — neither second nor app), plus the `STUCK` mark
in `status` for the residual case of an expired lease still held. A shorter alert threshold (15 min,
half the lease) would ring on a cook that reads before writing — the very case for which the lease was
raised to 30 min — and every alert would be a GitHub comment. Pushed alerts belong to milestones
5 and 6 (out of the issue's scope).

If the chef wants it anyway: a setting `BRIGADE_STALL_SECONDS` (default: half the lease, refused
if it exceeds it), a fact `ticket.stalled` written once per episode by the station, the
`STUCK` mark in `status` from that threshold, and a comment on the issue. The cook is not stopped:
it is the lease that stops.

**3. Where does the duration go in `status`?** Recommended: on the **ticket's line**, in the `rail` block
(it is a property of the taken ticket, and it reads next to "since" and the lease), not on the
cook's line, which carries the budgets.
