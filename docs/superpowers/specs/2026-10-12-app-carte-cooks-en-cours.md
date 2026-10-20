# The project tile carries its running cooks — spec (#371)

**Date**: 2026-10-12
**Status**: decided by the dev on the issue's criteria, **to be contested in review** — no product
decision was left open.
**Issue**: #371 (follow-up to #360, epic #294; screen `docs/maquettes/app/Main.dc.html`)

The behavior, as the chef lives it, is in `docs/app.md` ("The project tile"): this document does
not copy it.

## What the dev decided

1. **`cooks` is the only field the shape lets go missing.** Absent, it is a runtime from before
   #369: the facts are understood without it, and the tile says the cooks are not read — not "no
   cook". Any other missing field still refuses the whole shape.
2. **`cooks` given but not in the shape** (`null`, a number, a cook without a station) **refuses
   the shape**, like any other field: it is not an earlier runtime, and the app completes nothing.
3. **The cooks are laid out in the box's order**, as they are: the app does not sort them, does
   not match them to the rail, does not count them. The `taken` counter and the number of lines
   are two facts read, which may differ.
4. **An empty title stays empty**: the line carries the number and the station. The app does not
   go and look for it elsewhere.
5. **A cook's number opens nothing.** The ticket opens from the rail; the tile is for looking.
6. **The two fallback sentences are written in the main process** (`faits.ts`, `tableau`), with
   the cooks: the view lays down one or the other, it chooses nothing.

## Compared with the drawn screen

| Drawn (`Main.dc.html`, a project's tile) | Delivered |
|---|---|
| under the five counters, above the latest event, separated by a dotted line | same |
| one cook per line: a colored dot, the number, the title cut if it overflows, the station on the right | the number, the title cut (whole on hover), the station on the right — **no dot** |
| the dot is green, or yellow for an idle cook (`#14 idle for 11 min`) | none: `faits` says nothing of a cook's state, and a color would be a gauge per cook |
| `box/claude-opus`, `box/claude-sonnet` | the station as the box names it (`box/claude`): the model is not in `faits` |
| a project with no cook: a red line, "3 failures in a row on the gates · awaiting the manager" | `none running`: the why is in `status`, below |
| the whole tile is a link to the project's space | unchanged by this ticket: the space opens from the bar |
| nothing for a runtime without the field | the "not read" sentence, in place of the cooks |

## What was tested

- `npm --prefix app test`, `npm --prefix app run typecheck`.
- The app launched with a fake `claude` and a fake `ssh` that returns three `faits` — three cooks
  including one too-long title and one empty title; `cooks: []`; no `cooks` field —: "All
  projects" and the space panel were inspected (text and capture). The three tiles draw, the long
  title is cut in the narrow panel without pushing the station.
