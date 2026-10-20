# Several cooks at once — spec and plan (#98)

**Date**: 2026-10-09
**Status**: decided — the product decisions below are the orchestrator's (answer of
2026-10-09 to `question-spec #98`); "What the dev settled" can be contested in review
**Issue**: #98 "Several cooks work at the same time" — epic #101, milestone 4
**Builds on**: `2026-10-08-brigade-v2-design.md` (§ Scheduler, § Constraints),
`2026-10-08-station-claude.md`, `2026-10-08-zones-de-fichiers.md`, `2026-10-08-garde-fous.md`,
`2026-10-08-bail-progres-observable.md`. This document redecides nothing of what appears in them.

The behaviour, as the chef lives it, is in `docs/runtime.md`, "Plusieurs cooks à la fois":
it is the living doc, this document does not copy it.

---

## Product decisions

1. **The cap is set by a chef command**, which writes a fact to the log:
   `run station -- cooks <N>`. `0`: no limit. **30** as long as the chef has said nothing. Read at
   every take; shown in `station` and `status`.
2. **The cap only counts ticket cooks.** The manager's judgments and the reviewer's reviews no
   longer hold up the take: at a cap of N, N cooks, one judgment and the reviews in progress
   can run.
3. **The machine guard is in this ticket**: processor, memory, disk; thresholds adjustable through
   the environment (`1.5` of load per core, 1 GB of available memory, 5 GB of disk); read by
   an injectable function.
4. **Cleanup of worktrees and branches is not in it**: #139.
5. **The entry cost is bounded by a cap on simultaneous setups**, 4 by default.
6. **`status`**: one line per cook, with no sorting or folding — readability at thirty is #100.

## Criteria, and what carries them

| Criterion | What carries it |
|---|---|
| The cap is adjustable, and the chef sees its value | `station.capped` (author `chef`), column `cap` of the stations projection, `plafondDeCooks`; `run station` and the `cooks` line of `status` |
| At N, N cooks really run at the same time | `servir` no longer waits for a cook to end: it takes as long as `peutServir`, and each ticket leaves in its own `cuisiner` |
| Never above the cap | `prisPar`: the count is read at the rail, in the synchronous loop that takes — nothing slips in between the count and the take |
| Two overlapping zones do not leave together | `rail.prendre` is a transaction, and `tenants` counts a taken ticket: the first's zone is held before the second is chosen. Nothing to write, except the test |
| A cook that falls does not take the others with it | one supervisor per cook (already there); one watch per cook (`regards`, in place of the single `observer`); a `cuisiner` that stumbles is caught ticket by ticket |
| The log and `status` tell the cooks apart | `cook.launched` already carries station, calibration, branch, worktree; `status` reads them through `cookDeRun`, and the time without progress at the rail |
| Lowering the cap kills nobody | the cap is only read at the take |
| The station stops launching when the machine can't take it, and says so | `machine.ts`; `station.saturated` / `station.relieved`; `journalctl`; `status`, `station` |
| The entry cost is measured and bounded | `entrees`: the taken tickets whose cook is not launched, at most `BRIGADE_MAX_SETUPS` |

## What the dev settled

- **The count of cooks is that of held tickets** (`rail`: state `taken`, station `box/claude`),
  not that of processes: a ticket counts from its take, during its worktree and its setup. Counting
  processes would let thirty setups leave before the first `cook.launched`.
- **The entry bounds the take, it does not queue.** A ticket is only taken if it has a place
  at the entry: it stays queued on the rail, its lease does not run, and the bound also covers
  `git worktree add`.
- **Worktree preparations go one by one** in `depot.ts`: a single clone, and two
  `git fetch` of the same branch fight over `refs/remotes/origin/<base>` there.
- **A returned ticket is only taken up again once its kitchen is undone** (`rail.prendre(station, sauf)`).
  Without this — seen in test as soon as the take was no longer serialized — a ticket returned during its
  setup was taken up again at once, and the first kitchen, seeing "its" ticket held again
  by the station, launched a second cook on it.
- **The machine guard writes its transitions, not its looks**, with ten percent of margin to
  lift. An unreadable machine holds nothing back.
- **The memory read is `process.availableMemory()`**, not `os.freemem()`: measured on the dev
  workstation (macOS) on 2026-10-09, the second returns 0.4 GB when the first returns 6.8.
- **The announcement carries the default cap, the chef's setting lives apart**: an announcement rewritten at
  restart does not undo what the chef set.

## What the review changed (return 1, 2026-10-09)

- **Gradual ramp-up.** The guard only read the machine at the take, and the load lags by
  a minute: a rail of thirty left in one block. Each cook under a minute old, and each ticket
  at the entry, weighs one unit of load and 512 MB in advance (`reserver`). Held back by this reserve, the
  station writes nothing: the machine does not saturate.
- **The machine is read first**, before the "stop", the quota or the cap: `station.saturated` and
  `station.relieved` no longer depend on another bound. Unreadable, it no longer lifts a
  saturation: the station sticks to what it knew.
- **The cap counts `max(held tickets, kitchens not undone)`**, and `rail.prendre` receives the
  zone of each ticket still in the kitchen: returned or removed while its cook runs, a ticket
  frees neither a place nor a zone.

## Out of scope

Cleanup of worktrees and branches (#139). Integration of two concurrent deliveries (#99).
Breaker, "stop" and readability of `status` at N (#100). Quota arbiter (#63).

## Plan

1. Facts and projection: `station.capped`, `station.saturated`, `station.relieved`; `cap`, the
   saturation and the cook's worktree in the stations projection; `prisPar` at the rail.
2. `machine.ts`: reading, thresholds, saturation — and their tests, without the real machine.
3. The station: non-serialized take, the three bounds, one watch per cook, `sauf` at the take;
   preparations serialized in the repository.
4. What the chef reads and sets: `run station -- cooks <N>`, `run station`, `run status`.
5. Tests of the station with several cooks (fake `claude`, one case on a real git repository), and the
   fake `claude`'s suite consumed under lock — several cooks read it side by side.
6. Living doc: `docs/runtime.md`.
