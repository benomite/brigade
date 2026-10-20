# File zones — spec and plan (#73)

**Date**: 2026-10-08
**Status**: decided — the five product decisions below are the orchestrator's
(answers of 2026-10-08 to `question-spec #73`); "What the dev settled" can be contested in
review
**Issue**: #73 "Two concurrent tickets do not own the same file"
**Builds on**: `2026-10-08-fiche-du-ticket.md` (the card carries the zone, #68),
`2026-10-08-decoupage-epique.md` (the split assigns it, #71), `2026-10-08-runtime-rail.md`
(the service order, the dependencies of #70). This document redecides nothing of what appears there, except
point 7 of the card ("`zone`: strings, carried as they are"), which it closes.

---

## The rule

`2026-10-08-brigade-v2-design.md`, § The manager: "partitions by file zone (V1 rule
kept: one file, one owner between concurrent tickets)". At milestone 2 a single cook
runs: what the rule protects today is **the cut**, and the interval between a
delivery and its merge. Parallelism is at milestone 4.

The behaviour, as the chef lives it, is in `docs/runtime.md`, "Les zones de fichiers":
it is the living doc, this document does not copy it.

| Issue criterion | What carries it |
|---|---|
| The split assigns a zone; two tickets that can be served at the same time do not overlap | The split instruction ("one file, one owner"), then `separer`: code, on the answer read |
| Unavoidable overlap → a dependency, not a conflict | `separer` adds the rank of the first to the `waitsFor` of the second; the card born from it carries it; the split comment says so |
| The rail shows the zone | `run rail`: the card line (there since #68), `zone held by #N (path)` on a held ticket, and the common paths at the top |
| A cook that writes outside its zone is flagged, never silent | `cook.out-of-zone` in the log, "Out of zone" lines in the end-of-cook comment; the pass judges as before |
| The rule holds from now on, with a single cook | The rail's hold does not depend on `maxCooks`: a ticket in pass holds its zone |

## Product decisions

1. **Common paths per project.** `BRIGADE_COMMON_PATHS`, optional, empty by default. A common path
   belongs to nobody: it does not make two zones overlap, the split is warned,
   writing there is not out of zone. This is the answer to the trap "`docs/runtime.md` is touched by
   almost every ticket" — a strict rule would make the milestone a single queue.
2. **At the split, the code lays down the dependency** and says so on the epic. No second paid
   judgment, no split refused.
3. **On the rail, the second is held** until the first is served; `run rail` says
   why; the hold falls if the first leaves the rail.
4. **Out of zone**: a fact in the log and a line in the end-of-cook comment. A ticket
   with no card or no zone is never flagged. Nothing in `status`.
5. **The zone that judges is the zone at the take.** A card modified during the cook is shown,
   not judged — this is the limit left by #68: the cook runs under the service account and can
   edit the card of its own ticket.

## What the dev settled

Each has a test.

1. **The notation.** A zone is a list of paths; a path owns the file it names and
   everything below it, by whole segments. `./`, the trailing slash and `.` (the root) are
   tolerated. Nothing is read from disk.
2. **A pattern is a card problem** — `*` and `?` only. Brackets are not one:
   `app/[id]/page.tsx` is a path (Next.js routes). Consequence: a card that carried `*.md`,
   read "as is" since #68, becomes unreadable, and its ticket is 86'd at the next pass.
3. **"Concurrent" at the split**: two tickets neither of which awaits the other, even indirectly.
   `separer` walks the ranks from nearest to farthest: three tickets on one
   file make a queue (3 awaits 2, 2 awaits 1), not a fan.
4. **"The first" on the rail is the one that has left** — taken, in pass, 86 — not the first
   in the service order. As long as neither of the two has left, nothing holds anyone: the service
   order decides, and as soon as one is taken the other is held. Reason: holding behind a
   *queued* ticket opens deadlocks (A held by B's zone, B awaits C, C held by
   A's zone); behind a ticket that has left, none — it awaits nothing from the rail any more.
5. **An 86 holds its zone** (a ticket escalated to the chef in pass has an open PR), including when refused
   before any cook; it lets go when its delivery is merged (`merge.done`), even if it stays 86.
   **An unreadable card holds nothing**: its zone is not authoritative.
   **A ticket sent back by the pass holds its zone** (PR review): queued, but with an open
   delivery — `delivery` on the rail line, `open` from `ticket.passing` to `merge.done`.
   A ticket that itself has an open delivery is not held by another queued ticket:
   two send-backs on the same zone would await each other forever. The merge lets go of the zone only for that
   delivery: taken back or reopened, the ticket holds it again.
6. **The hold is not written**: it is recomputed when the rail is read (`TicketRail.held`), like
   `awaits`. A ticket that the card already says awaits does not appear in it.
7. **Common paths enter the log** (`rail.commons`, at startup, when they change):
   the rail can be reread from the log alone, and `run rail`, the manager and the station read them there — the CLI
   does not need the variable, and a replay gives back the same rail.
8. **The zone at the take is reread from the log** (the last card before the last `ticket.taken`),
   not from a station's memory: a delivery taken back after a restart is checked against the
   same zone. A send-back from the pass is a new take.
9. **A card that changed during the cook is shown even with no file out of zone**
   (`cardChanged: true`, `files: []`).
10. **The cook's instruction names the card**: its zone, not to write elsewhere without need, not to
    modify it. A cook that does not know it has a zone cannot hold to it.
11. **The owner of a file out of zone is named** when a ticket on the rail owns it
    ("in the zone of #N").

## Plan

| Module | What changes |
|---|---|
| `src/zones.ts` (new) | Pure, no I/O: `possede`, `recouvrement`, `horsZone`, `refus` |
| `src/fiche.ts` | A pattern in `zone` is a problem |
| `src/evenements/rail.ts`, `src/projections/rail.ts` | `rail.commons` and its table; `TicketRail.held` |
| `src/rail.ts` | `servable` requires a free zone; `retenue` returns `zone`; `direRetenue` says it |
| `src/alimenter.ts` | `BRIGADE_COMMON_PATHS` in `configRail`; `rail.commons` written at wiring |
| `src/decouper.ts`, `src/decoupage.ts` | The instruction; `separer`; `TicketPrevu.overlaps`; the split comment |
| `src/evenements/station.ts`, `src/station.ts` | `cook.out-of-zone`; `signalerHorsZone` at harvest and at resumption |
| `src/claude.ts` | The cook's instruction |
| `src/montrer-rail.ts` | The common paths at the top |

## Out of scope

- Several cooks in parallel (`maxCooks` stays at 1): milestone 4.
- The batch of tickets on disjoint zones merged in one go: milestone 3.
- Knowing **who** edited a card (GraphQL `editor`): dismissed, decision 5.
- Checking that a zone is *the right one* before the cook: it is the out-of-zone signal that says so, afterwards.
