# Positioning: "you are no longer at your computer"

Internal draft. Nothing here is published; the file stays in the repo.
Angle chosen by the chef on 2026-11-07. Vision: [`docs/superpowers/specs/2026-11-07-vision.md`](../superpowers/specs/2026-11-07-vision.md).
The earlier angle, "agents that ship, not agents you babysit", carries over into the second argument and into "What it is not".

Figures were counted on `main` on 2026-11-07, with the command given next to each. Recount before any use.

## In one sentence

Brigade works through everything it can do while you are away from your computer, and calls you on your phone only for the choices that are yours.

Proof: the vision, section 1 "Autonomy now" ([vision](../superpowers/specs/2026-11-07-vision.md)): "it works through everything it can do, and it calls a human only for a product or design choice, or for a review that only a human can make."

## Three arguments

### 1. The kitchen ships on its own

Most of what lands on `main` was cooked by the kitchen, not typed by a person.

- Of 1,191 pull requests merged in this repo, 1,016 (85%) come from a `cook/<n>-…` branch, the branch a kitchen cook works on.
- Source: `git log --merges --format=%s | grep -c 'Merge pull request'` gives 1,191; the same output filtered with `grep -c '/cook/'` gives 1,016. Window: 2026-10-02 (PR #2) to 2026-11-07.
- Limit: the branch name shows who cooked, not who clicked merge. Merging without the chef is a separate claim: a delivery is merged once its verdict is approved and its CI is green ([`docs/runtime/pass-merge.md`](../runtime/pass-merge.md)); the brakes are the `stop` that halts every cook and the second judge that reads any delivery changing what judges it ([`docs/runtime/pass.md`](../runtime/pass.md)).

### 2. It does not need babysitting: it stops itself and heals itself

An agent left alone must not run away. Brigade bounds each ticket and keeps the kitchen moving without you.

- Guardrails: a cap on duration and tokens, an idle stop, a breaker after repeated failures, and a "stop" that halts every cook within the second. Proof: the table in [`docs/runtime/garde-fous.md`](../runtime/garde-fous.md).
- What the chef may leave undecided is written down per kind of decision, in the autonomy table. Proof: [`docs/runtime/autonomie.md`](../runtime/autonomie.md), code in `runtime/src/autonomie/table.ts`.
- The rule is stated as a repo convention: "Every `blocked-on-human` without a product or design decision is a failure", to be fixed like a bug. Proof: the first section of [`CLAUDE.md`](../../CLAUDE.md).
- Self-healing is a stated goal, not a finished one: anything done by hand to keep the kitchen moving becomes the kitchen's own job (issue [#2745](https://github.com/benomite/brigade/issues/2745), vision section 1). Do not present it as done.

### 3. It reaches you on your phone, and only when it needs you

The point of leaving the computer is that Brigade comes to you with a question, not a pile of work.

- Each TODO card @-mentions the chef once on its issue, so that GitHub Mobile notifies them. Proof: merged PR #2765 (commit `5dac4e3`, `feat(#2746)`), checkable with `git log --grep='#2746'`.
- The Android app notifies the chef when a TODO card appears and opens it on tap. Proof: merged PR #2779 (commit `cba2f95`, `feat(#2747)`), checkable with `git log --grep='#2747'`.
- What counts as a question for the chef: a product choice, a design choice, or a review only the chef can make; never a technical merge with a green CI, a rebase, or a rerun. Proof: first section of [`CLAUDE.md`](../../CLAUDE.md).
- Not yet: teams, where each question goes to the right human ([#2748](https://github.com/benomite/brigade/issues/2748), vision section 2). Not claimed today.

## Who it is for

1. **Solo developers first.** One person with a backlog, who wants it worked through while they are elsewhere and who is called for the decisions only they can make. This is the case the vision's section 1 describes and the one the proofs above cover.
2. **Teams next.** The vision's section 2 treats humans as stations, with questions assigned to the right person on GitHub ([#2748](https://github.com/benomite/brigade/issues/2748)). It is a direction, not a shipped feature: say "next", not "today".

## What it is not

- **Not an agent you babysit.** You do not watch it, prompt it step by step, or restart it. Proof: arguments 1 and 2 (guardrails, autonomy table).
- **Not a pile of PRs to review.** Technical merges with a green CI are the kitchen's call, not a queue for you; only reviews that need a human come to you. Proof: [`CLAUDE.md`](../../CLAUDE.md) first section, and the merge rule in [`docs/runtime/pass-merge.md`](../runtime/pass-merge.md).
- **Not unbounded.** It runs inside caps and a stop you control (argument 2).
