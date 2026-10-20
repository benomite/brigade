# The guardrails and the kitchen state with several cooks — spec and plan (#100)

**Date**: 2026-10-09
**Status**: decided — the product decisions below are the orchestrator's (answer of
2026-10-09 to `question-spec #100`); "What the dev settled" can be contested in review
**Issue**: #100 "The guardrails and the kitchen state hold with several cooks" — epic
#101, milestone 4; plus the criterion added in a comment, taken from #98
**Builds on**: `2026-10-08-garde-fous.md`, `2026-10-08-runtime-status.md`,
`2026-10-08-bail-progres-observable.md`, `2026-10-09-plusieurs-cooks.md`. This document redecides
nothing of what appears in them.

The behaviour, as the chef lives it, is in `docs/runtime.md` ("D'affilée, à plusieurs
cooks", "Plusieurs cooks à la fois", "Voir la station", "L'état de la cuisine"): it is the
living doc, this document does not copy it.

---

## Product decisions

1. **"In a row" is counted in launch order.** A success only erases the failures
   of the cooks launched before it. Threshold unchanged (3), independent of the number of cooks. Judgments
   and reviews count in the same counter; the exception for the manager's relaunch (judged by the pass)
   is kept. Consequence accepted, written in the doc: out of thirty, the last three launched
   that fail open the breaker.
2. **"Stuck" from half the lease without progress**: named on the `cooks` line of `status`,
   lines sorted worst first, `cook.stalled` once per episode. Nothing is stopped earlier.
   No setting, no folding of the lines.
3. **A `consumed` line**, in `status` and in `run station`: the cooks in flight, the last 5
   rolling hours (the Max quota window), the last 24. Judgments and reviews
   included, with their count.

## Criteria, and what carries them

| Criterion | What carries it |
|---|---|
| The breaker counts the failures of all cooks | `cook_runs.judgment` / `judged_seq`, `guard_state.resumed_seq`; `failures` recomputed at every verdict: the failures judged since the last "resume", among the cooks launched after the last successful launch |
| The "stop" stops all cooks, none restarts | already there (`kitchen.stopped` consumed at wake-up, refusal at launch); tested at four cooks, and the station says `stopped` for the returned ticket |
| `status` readable at N, the chef sees which is stuck | `coince` (half-lease, read at the rail), the alert of the `cooks` line, `trierCooks` |
| Time without progress per cook, reported without being asked | already per cook in `status`; `cook.stalled` written by the station's watch, and a `journalctl` line |
| Aggregated consumption report | `consommation(base, depuis)` on `cook_runs` (which now keeps station, turns and tokens at the end) and `cook_progress` |
| Caps per cook, not shared | already there: one supervisor per cook (test "a cook that exceeds a cap does not take the others with it", #98) |
| A ticket withheld by the station reads, with the reason (#98) | `station.held` / `station.released`; `heldAt`, `heldReason` in the stations projection; `rail.servables` |

## What the dev settled

- **A cook's verdict is dated from its launch, its being taken into account from its judgment.** A failure
  judged before the last "resume" no longer counts; a cook launched before and failing after
  counts — the chef resumed, and that failure is new.
- **`status` does not read `cook.stalled`**: it computes the middle of the lease at the rail (`leaseUntil` and
  `progressedAt`), so to the second and without depending on the tick. The fact itself goes out at the station's next
  watch — one tenth of a lease later at most. The two share `PART_SANS_PROGRES`.
- **The hold is written on its transitions, and only if a ticket waits.** `rail.servables`
  counts what `prendre` would give: without it, a station at the cap facing an empty rail would write
  a hold that holds nobody. All the reasons go through it, not only the four of the
  criterion: "stop", breaker, quota and connection also hold a ticket.
- **A report window counts the cooks finished within it, in full.** Spreading a cook's consumption
  over its duration would require keeping each reading; the chef compares an order of magnitude to
  `/usage`, not an invoice.
- **`consumed` lives in the guardrails projection**, not in the sessions one that the issue pointed to:
  `cook_runs` is what knows all launches, judgments and reviews included.

## What the review changed (return 1, 2026-10-09)

- **No index in the projection's schema.** `ouvrirJournal` plays the schema before the
  runtime replays the log: on an existing `log.db`, `CREATE TABLE IF NOT EXISTS` left
  `cook_runs` in its old shape and the index on `judgment` made startup fail. Both
  indexes are removed — the table scans in milliseconds —, and a test opens a log in the old
  shape.
- **The hold is lifted when the runtime stops** (`station.released`): `status` no longer shows
  the hold of a station that is no longer there.

## Out of scope

Alert outside the Mac (#67). Cooks cap and its setting (#98). Integration of concurrent
deliveries (#99). Quota gauge (#63).

## Plan

1. Guardrails projection: dated verdicts, count in launch order, `consommation`.
2. Station facts: `station.held`, `station.released`, `cook.stalled`; stations projection.
3. Rail: `servables`. Station: `ceQuiRetient`, hold transitions, half-lease signal.
4. `status`: `STUCK` at half-lease, alert and sorting of cooks, holds, `consumed`. `run station`:
   `withholding`, `consumed`.
5. Tests: projections and rendering without a subprocess; for the station, assertions added to the existing
   tests rather than more kitchens — the gates have a processor cap.
6. Living doc: `docs/runtime.md`.
