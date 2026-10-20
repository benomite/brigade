# Opening the app for the first time: one gesture, and no JSON — spec (#313)

**Date**: 2026-10-12
**Status**: decided by the dev, **to be challenged in review** — the issue fixed the criteria,
the pointers and the traps; what remained, the shape of the add and the fate of a project that
leaves the file, was settled without a `question-spec`.
**Issue**: #313.

The behavior, as the chef lives it, is in `docs/app.md` ("Dire où sont tes projets", "Quand le
fichier change", "Lancer l'app"): this document does not copy it.

## What the dev decided

1. **The only gesture is `npm --prefix app start`.** Its `prestart` (`src/lancement.ts`, run by
   Node alone) installs the dependencies if they are missing — or if the lockfile is newer than
   the trace npm leaves in `node_modules` — then Electron's binary, and says each install in one
   line. Nothing to install: nothing said. A failed install stops the launch.
2. **The missing file is created at launch**, empty. An empty list is therefore no longer a
   refusal: it is "no project yet", and the app opens on the add screen.
3. **The add is a screen, not settings**: the folder is picked in the Mac's picker, the name is
   proposed, the box is optional. The `+ projet` entry stays at the foot of the bar. After the
   add, the kitchen — not the project's space: entering it launches a `claude`, and that gesture
   stays a click of the chef.
4. **The rules of the add are those of the read**, with no copy: the candidate file is passed to
   the same reader before it is written. A project that would not open (folder not found) is not
   added.
5. **The app writes only if it had understood the file**, and leaves in it what it does not read
   (unknown keys). It rewrites it whole, indented by two spaces: hand-made layout is not kept. It
   writes in place, with no renamed temporary file — a rename would replace a symbolic link (an
   `app.json` kept in dotfiles) with a file.
6. **The re-read is a watch on the folder** (`fs.watch`), not a clock: an editor that replaces
   the file stays followed. Returning to the window also re-reads — the watch is not alone.
7. **A refused re-read removes nothing**: the earlier projects stay, their terminals keep
   running, and a banner gives the path and the reason. Only a file refused *at launch* gives
   today's screen with no project.
   As long as it has not been re-read, **the add does not write to it**: recreating a deleted
   file to put a single project in it would make all the others leave, terminals included
   (review, referral 1). A creation refused at launch keeps its reason and is retried at each
   re-read.
8. **A project that leaves the list loses its terminals** — removed, renamed, or moved to another
   folder. Keeping them would leave running a `claude` that nothing displays any more; the
   conversation, for its part, stays with `claude`. This is the most contestable point: a rename
   kills a second in progress.
9. **Removing or renaming from the app is out of scope** (issue): it is done in the file.

## Plan

1. `app/test/config.test.ts`, `app/src/config.ts`: create, add, empty list.
2. `app/test/suivi.test.ts`, `app/src/suivi.ts`: re-read on change, keep on a refusal, say the
   projects that left — on real files, waiting for a fact.
3. `app/test/terminaux.test.ts`, `app/src/terminaux.ts`: `quitter(projet)`.
4. `app/test/lancement.test.ts`, `app/src/lancement.ts`, `package.json`: the single gesture.
5. `main.ts`, `preload.cjs`, `pont.d.ts`, the view: the wiring, checked by launching the app
   (fake `claude`, trial file) and by reading its screens through the debug port.
6. `docs/app.md`.
