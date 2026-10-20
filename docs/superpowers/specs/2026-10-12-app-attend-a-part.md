# The app sets apart what awaits the chef — spec (#318)

**Date**: 2026-10-12
**Status**: decided by the dev, **to be contested in review** — the issue fixed the criteria, the edge
(#311) and the traps; what remained, the form on screen, was settled without `question-spec`.
**Issue**: #318 (epic #294). Meets the first criterion of #296.

The behaviour, as the chef lives it, is in `docs/app.md` ("Ce qui t'attend, mis à part"):
this document does not copy it.

## What the dev settled

1. **The block is shown as it is, boundaries included** — its `awaiting` line, its `end awaiting` line.
   Removing the boundaries would force cutting the head line, which also carries the count or
   the sentence: that would be reading the block.
2. **The block comes out of the `status` output**, it is not shown a second time in it. The rest —
   what precedes it, then what follows it, blank line included — stays word for word, and its title
   says what it lacks.
3. **Full or empty, the block looks the same.** A colour when something is awaiting
   would require knowing whether it is empty: counting its lines or recognizing the sentence. The app does not
   know what the block says. (The counter in the bar is out of scope, for the same reason.)
4. **In the kitchen, one block per project**, at the head of its own — not a common stack at the top
   of the page, which would require saying which project each line comes from.
5. **The edge is that of `docs/runtime.md`, to the letter**: exactly one line that begins
   with `awaiting`, exactly one that equals `end awaiting`, the second after the first. Any other
   case — no boundary, only one, two — is "no edge": the output stays whole, and the app says
   it set nothing apart, without saying that nothing is awaiting. It names no cause (runtime
   from before #311: the expected case, stated in the doc).
6. **Only the `status` output is cut**; `grant` and `station` pass through as they are.
7. **An output with no edge leaves the project `pilotable`**: `status` answered. It is not a
   fourth state.
8. **The watch (`box.ts`) does not change**: it still returns the outputs word for word. The
   cutting lives in `attend.ts`, applied by `main.ts` at each read before the view — the view
   cannot import TypeScript, and stays thin: it places at the head what it receives.

## Plan

1. `app/test/attend.test.ts`: the block taken by its edge on outputs copied from the runtime;
   empty queue; any content between the boundaries; outputs with no edge or a wrong edge; other
   command; failed read.
2. `app/src/attend.ts`: `mettreAPart(lecture)`.
3. `main.ts`, `pont.d.ts`, `vue.js`, `vue.css`: the wiring and the presentation, verified by
   launching the app (fake `claude`, fake `ssh`).
4. `docs/app.md`.
