# Handing back to the manager on a set-aside ticket — spec and plan (#109)

**Date**: 2026-10-09
**Status**: decided — the five product decisions below are the orchestrator's
(answer of 2026-10-09 to `question-spec #109`); "What the dev settled" can be contested in
review
**Issue**: #109 "Nothing hands back to the manager on a ticket it set aside"
**Builds on**: `2026-10-08-manager-qualifie-et-calibre.md` (the triage, `chef-changed`, "the
chef's gesture is always stronger"). This document closes one point of it: "never again".

The behaviour, as the chef lives it, is in `docs/runtime.md`, "Lui rendre la main": it is
the living doc, this document does not copy it.

---

## What was true before coding

Established by reading `trier` (`runtime/src/manager.ts`), and fixed by a test:

- `chef-changed` only occurs if the manager placed something on the issue **and** it lacks
  `fire`, `model:` or `effort:`. An issue that is launched and calibrated returns "nothing" before this test.
- Placing, removing or correcting `prio:`, `question`, `decision`, `blocked-on-human` therefore
  **never** makes a `chef-changed` — neither on an issue the manager did not label, nor on a
  ticket it launched.
- Set-asides by label already lift by themselves: label removed, the issue is judged on the next turn.

The criterion "distinguish two gestures" was held by the code; it lacked a test and the doc. The
real hole: `chef-changed` had no way back, and nothing said so where it happens.

## The five decisions

1. **The gesture**: `npm --prefix runtime run manager -- return <n°>`, which writes
   `manager.handed-back` to the log, in the chef's name. No new protocol label.
2. **One gesture per reason.** `return` lifts only `chef-changed`. For `blocked-on-human`,
   `question`, `decision`, `already-split`, the command forces nothing and says the gesture that lifts
   the set-aside; `roadmap` and `untrusted-author`: explained refusal.
3. **Truly afresh.** On the hand-back, the manager removes the calibration labels it had placed
   itself and that remain, then places those of the new judgment. A chef's label is never
   touched.
4. **Visible where it shows.** The "ticket put on the rail" comment warns, before the gesture;
   the `chef-changed` set-aside is commented once on the issue, with the command.
5. **The report** carries a "set aside" section ("écartées"), bounded, with the reason in plain words and the gesture.

| Issue criterion | What carries it |
|---|---|
| A way to hand back, whatever the reason | `return` for `chef-changed`; removing the label or the list for the others — the command and the report say which |
| Visible where the problem shows | The `chef-changed` set-aside comment on the issue; the "set aside" section |
| The chef knows beforehand | The warning in the "ticket put on the rail" comment |
| Two gestures distinguished | The triage, unchanged; a test (`ranger son backlog n'écarte rien`); the doc |
| Judged afresh | `manager.handed-back` erases the issue's line; `manager.withdrew` removes its former calibration |
| The report shows what is set aside and why | `run manager`, "set aside" |

## What the dev settled

- **A hand-back is not a decision.** `manager.handed-back` deletes the issue's line in
  `manager_issues`: it becomes an unknown again, and all the existing triage applies to it without one more
  case. What the manager had placed on it goes into `manager_returned`, for the time of the removal;
  the line stays there until the next decision — it is what says "handed back, not yet rejudged".
- **Handing back an issue does not modify it on GitHub**: the poll answers "unchanged". The manager
  therefore keeps the list from the last confirmed poll, next to the ETag that designates it, and re-triages it
  as long as a hand-back is waiting. No extra request, `github.ts` is not touched.
- **A hand-back with no object** — the chef redid everything itself in the meantime, or the issue is closed —
  stops making the list re-triaged after a full turn (process memory, recomputed on
  restart). The report keeps saying it "handed back": no fact settles it. Minor defect,
  known.
- **A `fire` placed by the manager and still there is not removed** on the hand-back: decision 3 speaks of
  calibration. If the new judgment refuses the issue, `fire` stays, and the refusal comment says so
  as for a chef's `fire`.
- **The set-aside says what is lacking, not what was removed.** `manager.set-aside` (`chef-changed`)
  carries `lacking` — `fire`, `model:`, `effort:` absent at the time of the set-aside. After a raise or a
  calibration replaced by the chef, the log no longer knows which of its labels was still there. This
  field also serves as a boundary: a `chef-changed` written before it is not commented after the fact,
  and a set-aside already said is not said again when only `fire` moves in it.
- **Handed back, then relaunched and calibrated by the chef** before the manager comes back to it: nothing is
  removed, nothing is rejudged.
- **The labels placed by a raise** (`manager.raised`) belong to the manager: they are removed
  like those of `manager.labeled`.
- **Exit code of `return`**: 0 if the hand-back is in the log or already was, 1 if nothing is
  handed back (the message says why), 2 on an invalid usage.
- **`already-split`**: handing back means removing the list from the body — the epic is then
  split. The command does not re-split over a hand-written list (duplicate tickets).

## Plan

1. Facts `manager.handed-back`, `manager.withdrew`; projection (`manager_returned`,
   `ecarteesDuManager`).
2. Manager loop: calibration removal, re-triage of the confirmed list, comments.
3. CLI: `return`, "set aside" section.
4. Living doc.
