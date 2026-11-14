# Positioning: "Autonomy you can trust"

Internal draft. Nothing here is published; the file stays in the repo.
Message set by the chef on 2026-11-14 (#3580). Vision: [`docs/superpowers/specs/2026-11-07-vision.md`](../superpowers/specs/2026-11-07-vision.md).
It builds on the angle of 2026-11-07, "you are no longer at your computer", which becomes the promise; trust becomes the product, because you only walk away from what you trust. The earliest angle, "agents that ship, not agents you babysit", carries over into "What it is not".

Figures were counted on `main` on 2026-11-14, with the command given next to each. Recount before any use.

## In one sentence

**Autonomy you can trust.** Brigade works through everything it can do while you are away from your computer, and calls you on your phone only for the choices that are yours.

Proof: the vision, section 1 "Autonomy now" ([vision](../superpowers/specs/2026-11-07-vision.md)): "it works through everything it can do, and it calls a human only for a product or design choice, or for a review that only a human can make."

## The promise and what makes it believable

Autonomy is the goal. Trust is what lets you take it: an agent you must watch is not autonomous, whatever it can do. So every argument below answers one question: *why can I leave it running?*

### 1. It is bounded

An agent left alone must not run away. Each ticket runs inside limits you did not have to set.

- A cap on duration and tokens, an idle stop, a breaker after repeated failures, and a "stop" that halts every cook within the second. Proof: the table in [`docs/runtime/garde-fous.md`](../runtime/garde-fous.md).
- What the kitchen may decide without you is written down per kind of decision, in the autonomy table. Proof: [`docs/runtime/autonomie.md`](../runtime/autonomie.md), code in `runtime/src/autonomie/table.ts`.

### 2. It is judged

Nothing reaches `main` because a cook says it is done.

- The pass judges every delivery: the project's gates, the CI, and an independent review. A delivery is merged only once its verdict is approved and its CI is green. Proof: [`docs/runtime/pass-merge.md`](../runtime/pass-merge.md).
- A delivery that changes what judges it is read by a second judge. Proof: [`docs/runtime/pass.md`](../runtime/pass.md).

### 3. It is traceable and reversible

Everything the kitchen does lives where you already look: issues, labels, branches, pull requests, commits. Nothing is held in a session's memory.

- You can read why each change was made (its ticket), how it was judged (its pull request) and undo it (a revert). Proof: the README, "Everything lives in durable artifacts".
- Not yet: the app showing you, when you come back, what the kitchen did while you were away ([#3579](https://github.com/benomite/brigade/issues/3579)). Say "coming", not "today".

### 4. It is proven, on itself

Brigade is built by Brigade. The track record is public.

- Of 1,507 pull requests merged in this repo, 1,332 (88%) come from a `cook/<n>-…` branch, the branch a kitchen cook works on.
- Source: `git log --merges --format=%s | grep -c 'Merge pull request'` gives 1,507; the same output filtered with `grep -c '/cook/'` gives 1,332. Window: 2026-10-02 (PR #2) to 2026-11-14.
- Limit: the branch name shows who cooked, not who clicked merge (see argument 2 for the merge rule).

### 5. It asks only when it must

Trust also means not being bothered for nothing. Brigade comes to you with a question, not a pile of work.

- What counts as a question for the chef: a product choice, a design choice, or a review only the chef can make; never a technical merge with a green CI, a rebase, or a rerun. Any other `blocked-on-human` is a bug. Proof: first section of [`CLAUDE.md`](../../CLAUDE.md).
- Each TODO card @-mentions the chef once on its issue, so that GitHub Mobile notifies them. Proof: merged PR #2765 (`feat(#2746)`), checkable with `git log --grep='#2746'`.
- The Android app notifies the chef when a TODO card appears and opens it on tap. Proof: merged PR #2779 (`feat(#2747)`), checkable with `git log --grep='#2747'`.
- Self-healing is a stated goal, not a finished one: anything done by hand to keep the kitchen moving becomes the kitchen's own job (issue [#2745](https://github.com/benomite/brigade/issues/2745)). Do not present it as done.

## Who it is for

1. **Solo developers first.** One person with a backlog, who wants it worked through while they are elsewhere, and who needs to trust what lands while they are gone. This is the case the vision's section 1 describes and the one the proofs above cover.
2. **Teams next.** The vision's section 2 treats humans as stations, with questions assigned to the right person on GitHub ([#2748](https://github.com/benomite/brigade/issues/2748)). It is a direction, not a shipped feature: say "next", not "today".

## What it is not

- **Not an agent you babysit.** You do not watch it, prompt it step by step, or restart it. Proof: arguments 1 and 5.
- **Not a pile of PRs to review.** Technical merges with a green CI are the kitchen's call, not a queue for you; only reviews that need a human come to you. Proof: argument 2.
- **Not blind trust.** It runs inside caps and a stop you control, and every change it makes can be read and reverted (arguments 1 and 3).
