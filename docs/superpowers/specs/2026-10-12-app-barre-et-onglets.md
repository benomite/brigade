# The app has its icon bar and its content tabs — spec (#344)

**Date**: 2026-10-12
**Status**: decided by the dev, **to be contested in review** — the issue fixed the criteria and the
pitfalls, the V2 spec named the tabs ("Second (the terminal), Rail, Cooks, Grants, Log"); what
remained, the on-screen form, was settled without `question-spec`.
**Issue**: #344 (follow-up to #339, epic #294).

The behaviour, as the chef lives it, is in `docs/app.md` ("La barre d'icônes", "Les
onglets : Second, Rail, Cooks, Grants, Log"): this document does not copy it.

## What the dev settled

1. **The content tabs are in the space's tab strip**, next to Second — the reading of the
   V2 spec — and take the terminal's place. The right-hand panel does not move: it is what holds
   "the `awaiting` block stays visible without changing tab".
2. **The panel now reads only `status`**; `grant` has its tab. On the second, the app therefore launches
   one `ssh` per poll instead of two; on a content tab, two. Never four more.
3. **The tab has its own watch** (a second `ouvrirVeille`, set up the same way), not one more command
   in the panel's: a watch returns its outputs or the first error, and a
   `log` refused by an old runtime would have removed `status` and the `awaiting` block from the panel.
   `box.ts` does not change. Price: two connections in parallel to the same box, for the single project
   displayed.
4. **An error in a tab is read with today's headers and referrals**, as
   they are — including "REACHED, BUT NO LONGER DRIVABLE", which may sit next to a `drivable` panel.
   Each reading says what *its* command returned; wording specific to the tab would be an
   eighth state.
5. **The view names a tab, not a command**: `onglets.ts` holds the mapping, and a name
   that is not its own launches nothing. A test holds it against `runtime/package.json`.
6. **The monogram comes from the name and from it alone**: the initial of the first two words, or the first
   two letters. Two projects may carry the same one; the app does not tell them apart — the full name
   is on hover and at the top of the space, which no longer displayed it anywhere else.
7. **The kitchen is a round tile, `K`**; the `+` is at the bottom. No badge, no state colour:
   they await the runtime's form (#343, #346).
8. **A project that does not open keeps its four tabs**: its box is readable. Its Second tab
   shows the reason for the refusal.
9. **`Log` relays `log` with no argument**, re-read in full every thirty seconds. Following it
   live remains a terminal action.

## Plan

1. `app/test/barre.test.ts`, `app/src/barre.ts`: the monogram; the configuration as the
   view receives it.
2. `app/test/onglets.test.ts`, `app/src/onglets.ts`: the four tabs, their commands against
   `runtime/package.json`, an unknown name, a single `ssh` for the displayed tab.
3. `main.ts`, `preload.cjs`, `pont.d.ts`: the second watch, the `onglet` action, the `contenu` channel.
4. The view: the bar, the tab strip, the content area. Verified by launching the app against a
   fake `claude` and a fake `ssh`.
5. `docs/app.md`.
