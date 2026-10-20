# A reader without access to the box reads it as such — spec (#319)

**Date**: 2026-10-12
**Status**: settled by the Manager on `question-spec` (issue comment, 2026-10-12).
**Issue**: #319 (epic #294), follow-up to #314.

The behavior, as the reader experiences it, is in `docs/app.md` ("The kitchen", "What the box
says about the project"): this document does not copy it.

## What was settled

1. **Key refused: no new state.** `ssh` exits with 255 for a refused key as for an unknown host, a
   refused connection or an unknown host key; only its text tells them apart, and the app deduces
   nothing from a text. The header stays `UNREACHABLE`. Under `ssh`'s message, a fixed text — the
   same for any 255 that `ssh` returned by itself — names where its phrases are explained
   (`docs/installer.md`, "Reaching the box") and where access is given ("Adding a human"). No
   port probe, no reading of `stderr`.
2. **Without the right to the action: a state of its own**, on code 68, the only one that can be
   relied on — `REACHED, BUT WITHOUT THE RIGHT TO THE ACTION`, pointing to "Adding a human".
3. **127: a state of its own, that says what the code proves** — `REACHED, BUT A COMMAND IS
   MISSING ON THE BOX`. 127 is the shell's code for any command not found; the app therefore does
   not say "the action remains to be installed", it points to "Preparing the box" and lets the box
   name the command.
4. **69 (`sudo` missing) shares this state and this pointer.** 67 does not move.
5. **The update advice** (`git pull`, `restart`) only stays under `NO LONGER DRIVABLE`.

## What the dev settled

- **A single field, `cas`, replaces `inconnu`** in `Echec`: what the exit code proves by itself
  (`ssh-en-echec`, `projet-inconnu`, `sans-droit`, `commande-manque`), or `null`. `atteinte` stays
  what it was.
- **A 255 caused by the timeout is not an `ssh-en-echec`**: once stopped, `ssh` wrote nothing that
  can be read in the doc. No pointer either when `ssh` could not be launched.
- **The titles targeted in `docs/installer.md` are those from after #315** ("Preparing the box").

## Plan

1. `app/test/box.test.ts`: 68, 127 and 69, the codes that belong to no case, and `ssh`'s 255
   separated from the timeout's.
2. `app/src/box.ts`: `cas`.
3. `app/src/vue/vue.js`, `vue.css`: two states, three texts.
4. `docs/app.md`.
