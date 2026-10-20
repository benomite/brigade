# The worktree leaves at the end of the cook — spec and plan (#164)

**Date**: 2026-10-09
**Status**: decided — the four product decisions below are the orchestrator's (answer of
2026-10-09 to `question-spec #164`, recorded as a comment on the issue); "What the dev decided" can
be contested in review
**Issue**: #164 "The worktree leaves at the end of the cook, after committing what is lying around"
**Replaces**: the rule of `2026-10-09-nettoyage-des-worktrees.md` (#139) — "unpushed work is kept",
"nothing is removed while the ticket is on the rail". The chef's decision
(`2026-10-08-brigade-v2-design.md`, § What is tidied without waiting for the closing) prevails:
**nobody goes back into a failure's worktree.**

The behavior, as the chef lives it, is in `docs/runtime.md`, "What remains after a cook": that is
the living doc, this document does not copy it.

---

## What was true before coding

- The pass did everything in the cook's worktree: gates, reviewer (its `cwd`), reading the commit,
  its cleanliness, the diff — and, before merging, the meeting with the base, which can happen
  days after the verdict (no grant, slow CI, red base).
- A send-back resumed the worktree of the refused delivery.
- The cleanup (#139) only ran once the ticket was served or off the rail, and kept any worktree
  carrying work absent from the origin (`unpushed`) or an open PR (`pr-open`).
- The pass turned a delivery red when its worktree carried uncommitted changes.

## The four decisions

1. **The moment: the end of the cook, in the strict sense.** The worktree leaves as soon as the
   station has recounted the end of the cook. The pass gives itself a throwaway worktree on the
   delivered commit, as it already does for the meeting; everything else is read from the branch,
   in the clone.
2. **In a delivery, what is lying around is committed before the push.** The harvest commit is
   part of the delivery: the judged commit is the branch's. It is flagged to the reviewer as not
   written by the cook. Accepted risk, and stated in the doc: a new file the project does not
   ignore goes into the PR.
3. **The harvest does not make a delivery out of a failure.** The end of the cook is read from
   what it committed itself. What is lying around after a failure is committed on its **local**
   branch, never pushed.
4. **The cleanup becomes the catch-up of the same rule.** Every worktree that the log recounts and
   that no cook occupies any more is committed then removed — those of interrupted cooks, and the
   stock kept under the old rule. The only remaining reason to keep one: `failed`. A local branch
   leaves as before (ticket served or off the rail, everything on the origin); a branch carrying
   commits absent from the origin stays, without being listed — its fate is another ticket.

## What the dev decided

- **The repository reads branches, no longer worktrees.** `commits`, `tete`, `changes`, `diff`,
  `retard` take the cook's branch and are played in the clone. It is also what `pousser` pushes: a
  cook that detached its head only ever delivered its branch.
- **A worktree that is no longer on its branch is not harvested** (detached head, rebase in
  progress): the commit would go nowhere. It is kept, reason `failed`, and reported.
- **`worktree.removed` changes meaning**: the worktree is gone, the branch stays. It carries
  `harvest`, the harvest commit or `null`. A fact from before #164, without `harvest`, still says
  the branch left with it. The local branch has its own fact: `branch.removed`.
- **The catch-up lives in the station**, no longer in the pass: it is the station that tidies its
  worktrees, and the pass no longer reads any. It runs at startup — before the first take, so that
  a send-back finds its branch free — then at the tick. In running life, it only touches what the
  station has already failed to tidy.
- **The send-back** gets a new worktree (`worktrees/<run>`) attached to the branch of the refused
  delivery. It is recognized by the clone still knowing that branch.
- **"Has delivered"** is read against the branch head at the cook's entry, no longer against the
  judged commit: a failed cook between two send-backs may have left a harvest commit there.
- **A ticket that goes to pass with commits is always pushed**, even if its send-back cook added
  nothing: the local branch may carry the harvest of an earlier failed cook, and the pass judges
  the branch.
- **The pass judges what the origin received of the branch**, not the local branch (send-back 1 of
  the review): a harvest laid down at tidy-up after the delivery is never pushed, and GitHub knows
  neither its CI nor its commit. It stays local, for the send-back cook.
- **A worktree that is no longer on its branch at the end of the cook is a failure**
  (`off-branch`), before any other reading: relying on the branch of a cook that left it would
  turn work committed elsewhere into a ticket with no diff.
- **A remaining local branch is looked at once per runtime life**: without that, each failed cook
  would cost two `git` calls per tick, unbounded.
- **`no-commit` on a send-back** only applies to the send-back of a ticket with no diff. On a
  branch that already carries a delivery, a send-back cook that concludes leaving uncommitted
  files delivers: harvest, push, pass.
- **`worktree-lost` stays**, for the single case where the clone no longer knows the branch (a
  restore onto a new clone). Recreating the branch from the origin is outside this ticket.
- **A delivery's gates and workflows are read in the branch** (`git ls-tree`), not in a worktree:
  the pass only lays down its throwaway worktree to play the gates or to have a review done, not
  at every wake-up of a CI that is late.

## Plan

1. `depot.ts`: `recolter`, `ranger`, `elaguer`, `reprendre`, `poser`, `connait`, `liste`,
   `recoltes`; reads by branch; `liberer`, `present`, `propre` disappear.
2. Cleanup facts and projection: `harvest`, `branch.removed`.
3. `nettoyage.ts`: `ranger` (one worktree, at the end of its cook) and `rattraper` (the stock, the
   branches).
4. `station.ts`: harvest before the push, tidy-up after the end is recounted, send-back on a new
   worktree, resumption after restart read in the branch.
5. `pass.ts`: throwaway judging worktree, reads by branch, end of the "dirty worktree" findings.
   `reviewer.ts`: the harvest commit flagged.
6. `docs/runtime.md`, with the measured cost of the cold setup per judging.
