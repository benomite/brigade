# Red integration base: the station withholds — spec and plan (#143)

**Date**: 2026-10-09
**Status**: decided — the criteria are those of the Manager's qualification (comment of
2026-10-09 on the issue); "What the dev settled" can be contested in review
**Issue**: #143 "Red integration base: the station still launches cooks on it" — epic
#101, milestone 4
**Builds on**: `2026-10-09-rencontre-des-livraisons.md` (#99, which introduces `base.checked` and
deferred this point to here) and `2026-10-09-garde-fous-a-plusieurs-cooks.md` (#100, which introduces
`station.held` / `station.released`). This document redecides nothing of what appears in them.

The behaviour, as the chef lives it, is in `docs/runtime.md` ("Plusieurs cooks à la fois",
"La base est contrôlée après merge"): it is the living doc, this document does not copy it.

---

## Criteria, and what carries them

| Criterion | What carries it |
|---|---|
| Red base: the station launches no new cook | `ceQuiRetient` (`runtime/src/station.ts`) reads `etatDeLaBase` and returns the `base` hold |
| It says so like any other hold (`status`, `station`, the ticket line) | `base` enters `Retenue` and `RETENUES`: `station.held`, the stations projection, `run status` and `run station` pick it up with no other change |
| Cooks in flight are not stopped | the hold applies only to the take; nothing touches cooks already launched |
| It restarts on its own when green | the base state is re-read at every take: as soon as `base.checked` is no longer `red`, the next take goes through |

## What the dev settled

- **Every take is held, sent-back tickets included.** A ticket returned by the pass restarts in its
  worktree, but its gates are replayed against the base: on a red base, it would burn a
  send-back for nothing — exactly what the issue wants to avoid.
- **The manager's judgments and the reviewer's reviews are not held.** They do not go through the
  take, do not start from the base, and the other holds do not stop them either.
- **`skipped` is not a red.** Base gates that could not be played hold nothing back,
  just as they do not suspend merges (#99).
- **Rank of the hold**: after the "stop" and the breaker, before the connection, the quota and the
  caps. When several bounds hold, the station names what the chef must lift first;
  the machine is read regardless.
- **No dedicated wake-up.** The pass writes `base.checked` in the runtime's process; the station
  re-reads it at the next wake-up (tick or poll — one minute at most). The pass itself only
  re-reads a red base at the tick: one more thread between the two would gain nothing.
- **No extra journald line.** The pass already announces the red base; the hold, for its part, is
  read in the log and in `status`, like the others.

## Plan

1. Red tests: the station (hold, cooks in flight intact, resume on green, `skipped`, rank),
   the stations projection, `status`, `run station`.
2. `Retenue` and `RETENUES` gain `base`; `ceQuiRetient` reads `etatDeLaBase`.
3. Living doc: `docs/runtime.md`.
