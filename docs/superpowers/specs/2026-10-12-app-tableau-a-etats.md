# The app draws what is a state board — spec (#346)

**Date**: 2026-10-12
**Status**: PO criteria copied onto the issue; what they left open is settled by the dev,
**to be contested in review**.
**Issue**: #346 (follows #339, epic #294). The shape read is that of #343.

The behaviour, as the chef lives it, is in `docs/app.md` ("Ce qui est dessiné"): this
document does not copy it.

## What the issue sets

The bar (one pill per project, read), the project tile (five counters, the latest event),
the rail (ticket by ticket, a ticket opens on its issue), the stop banner (and the button that
writes the resume). Still in text: the log, the grants, `station`. No gauge. A box that
does not return the shape reads as such. Nothing is added to the runtime.

## What the dev settled

1. **`facts` is read separately, for all projects, whatever the screen.** A third watch
   (`box.ts`, unchanged), restarted when the bar is redrawn. Separately, because in a single
   read the first command that fails is the error of all: a runtime from before `facts`
   would have lost its `status`. For all, because the bar is always on screen. Cost: one more
   `ssh` per project every thirty seconds.
2. **The main process formats, the view draws** (`faits.ts`, `tableau`). The view imports
   no module: it receives the word, the number, the colour name, the sentences — and computes none
   of them. Everything that can be proven is therefore played by `node --test`.
3. **The shape is read field by field, and nothing is filled in.** A missing field, a counter
   that is not a positive integer: the whole shape is refused, and the box's output is
   shown word for word with what is wrong. An extra field is left aside; an unknown state word
   is kept, with no colour.
4. **The colours.** Project: `open` green, `held` yellow, `stopped` and `off` red — the
   three colours of the mock-up, as #339 describes it. Ticket: `queued` grey, `taken`
   blue, `in pass` yellow, `served` green, `BLOCKED` and `86` red. These are names (`data-ton`), not
   a theme: the skin stays with the `design` issue.
5. **The banner is drawn on `stopped`, not on `off`.** "KITCHEN STOPPED" is the chef's "stop",
   and its resume is a gesture of "Piloter" (`guardrails resume`): the button that
   has existed since #345, drawn again here. An off runtime is restarted by `systemctl`, on the box — no
   button writes it, and the app adds none. What the banner says about the stop is copied from
   `docs/runtime.md`, and a test holds it.
6. **An issue's address is the shape's** (`rail[].url`), not an address composed by
   the app: the projects file declares no repository, it is to the runtime that the project declares
   its own. The view names a project and a ticket; the address stays with the main process, and **only an
   `https` address opens** (`shell.openExternal`) — what a box returns is not launched as a
   file or a program.
7. **The text of `run rail` stays under the drawn rail.** It says what the shape does not carry — who
   holds a ticket, since when, what it is awaiting.
8. **The rail stays in service order**, the state in colour on each ticket: "by state"
   is not read as a grouping, which would have undone the order the runtime gives.
9. **The tick's age is displayed, never concluded** — no threshold, no colour — as the shape asks.
   Ages are counted between two box times (`lu`, and the fact's).
10. **The kitchen keeps its text under the tile**, and nothing in it is clickable still: the banner and
    its button are in the project's space, where the second is.

## What the review added (round 1)

11. **A project opens only one connection at a time, all watches combined.** The three watches
    share one pass per project (`box.ts`, `passage`): `facts` waits for `status` to have
    finished, and the reverse. Read side by side, 2N `ssh` arrived on the box in the kitchen, and sshd
    (`MaxStartups`) refuses some at random. The cost of point 1 becomes: one more read per
    project, after the others.
12. **The tile says the same case as `status`**: 65, 68, 69/127, 70 carry their header and their
    pointer — not "`facts` did not answer, update the runtime". That advice stays only for
    a reached box whose code names no case. The header words are held equal to those of the
    view by a test.
13. **The tile and the banner are redrawn as soon as the project changes**, before its space
    opens: the stop banner of the project left does not stay clickable on the next one.

## The mock-up

It is not in the repository (#338 open): nothing could be checked against the drawn screen. What
is known of it comes from the board of #339. Deliberate gaps with that board: no gauge, no preprod,
no Mac runner, no other engines (criteria); the latest event carries its type as is, not a
sentence ("green pass on #216, merge") — the shape gives no sentence, and the app does not
compose any; the global "Stop kitchen" does not exist, the stop is per project.

## Checked on the real thing

The app launched with a fake `claude` and a fake `ssh` (six projects: open, stopped, runtime from before
`facts`, unknown state word, no box, unreachable box), and captured: the bar's pills
and their hover, the tile in the kitchen and in the panel, the rail with its seven states
(including an unknown one, with no colour, and a ticket at the `file:` address with no link), the banner, and its
button that writes `!ssh box brigade parade guardrails resume` into the second. Not tried:
opening an issue in the browser, nor a real box.

## Plan

1. `app/test/faits.test.ts`, then `app/src/faits.ts`: the shape, the board, the colours, the
   addresses, the banner.
2. `main.ts`, `preload.cjs`, `vue/pont.d.ts`: the facts watch, `faits`, `ouvrirIssue`,
   `surFaits`.
3. `vue/`: pills, tile, rail, banner.
4. `docs/app.md`.
