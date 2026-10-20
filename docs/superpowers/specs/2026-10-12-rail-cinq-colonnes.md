# The app's rail in five columns — spec (#370)

**Date**: 2026-10-12
**Status**: decided by the dev on the issue's criteria and the PO's decision in a comment on
#360, **to be contested in review** — no product decision was left open.
**Issue**: #370 (follow-up to #360, epic #294; screen `docs/maquettes/app/Brigade.dc.html`)

The behaviour, as the chef lives it, is in `docs/app.md` ("Le rail", "Le numéro qu'elle y
lit"): this document does not copy it.

## What the dev settled

1. **The extra contract comes down to one form**: two spaces, `#`, digits, two spaces or the
   end of the line. Nothing else is read from a line of the block — neither `depuis`, nor the reason, nor the
   title. The rest of the line is placed on the card, word for word.
2. **The test that holds it has the runtime write the block**: `app/test/attend.test.ts` calls
   `decrireAttentes` (`runtime/src/attend.ts`) with one wait of each kind. An app test
   therefore imports a runtime module — nothing is added to the runtime, and a change to the head
   of an entry turns the gates red for whoever makes it.
3. **A line without a number is in no column** (the station without a Max connection, the bilan
   for want of a grant): it stays in the separate block, on the right.
4. **A ticket that the block names and that `faits` does not return** (dropped issue, epic in question)
   has its card in Awaiting you: number and line, without title or state, and without a link — `faits` does not give
   its address, and the app composes none.
5. **An `86` that is not awaiting you, and an unknown state word, are read under the columns**, under
   `hors des cinq colonnes`: no ticket that `faits` returns disappears from the drawing.
6. **Awaiting you says when it is not read** (`?`): `faits` and `status` are two readings, and the
   second may be missing. The tickets then stay in the column of their state word. A reading
   of `status` that failed or has no edge removes the previous block.
7. **The sorting is done in the main process** (`faits.ts`, `rail`), which holds the last block of
   each project next to its facts and returns the board to the view when either
   changes: the view places, it sorts nothing.

## Compared to the drawn screen

| Drawn | Delivered |
|---|---|
| five columns, their name, a coloured dot, a count | the same; the count is that of the cards |
| a card: number, meta, title, tags, footer | number, state word in place of the meta, title; the footer exists only in Awaiting you (the block's line); **no tags** (PO's decision) |
| the whole card is a link, to the cook's live view | only the number opens, on the issue: a cook's live view is in the parking |
| column colours (green for Taken, blue for Pass, orange for Awaiting you) | those of the state words already set by #346 (blue, yellow; red for Awaiting you): a theme is out of scope |
| columns of at least 200 px, the area scrolls | at least 104 px (160 for Awaiting you): the five fit next to the right-hand panel at the opening size |
| light cards on a dark background | the app's current skin |
| on the right: questions with buttons, grants, weights; above: epics | out of scope |

## What was tested

- `npm --prefix app test`, `npm --prefix app run typecheck`.
- The app launched with a fake `claude` and a fake `ssh` that returns a `faits` and a `status`: the Rail
  tab inspected (text and screenshot) — five columns, #21 and #12 moved into Awaiting you, #30 without a link,
  #40 (`86`) under the columns, the `claude` line in the right-hand block alone.
