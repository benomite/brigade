# Cleaning up worktrees and branches — spec and plan (#139)

**Date**: 2026-10-09
**Status**: decided — the five product decisions below are the orchestrator's (answer of
2026-10-09 to `question-spec #139`, recorded as a comment on the issue); "What the dev settled" can
be contested in review
**Issue**: #139 "The worktrees and branches of served deliveries are cleaned up"
**Partly superseded** by `2026-10-09-worktree-fin-de-cook.md` (#164): the worktree goes at the
end of the cook, and none is kept any more for unpushed work or an open PR. What follows
remains true of local branches.
**Builds on**: `2026-10-08-station-claude.md` (one worktree and one `cook/<run>` branch per
cook), `2026-10-08-pass-et-grant-merge.md` (`finir`, the send-back that resumes the refused
worktree), `2026-10-09-plusieurs-cooks.md` (the repository queue: one git action at a time on the clone).

The behaviour, as the chef lives it, is in `docs/runtime.md`, "Ce qui reste après un
ticket": it is the living doc, this document does not copy it.

---

## What was true before coding

- A ticket can have **several** worktrees: only a send-back from the pass resumes the one of the
  refused delivery; every cook relaunched after a failure, an expired lease or an 86 starts from a
  fresh worktree. `station_cooks` keeps, for each cook, its ticket, worktree, branch and PR.
- Nothing ever removed a worktree a cook had entered: `depot.retirer` only serves the fresh
  worktree whose setup failed.
- A cook killed by a guardrail, or that fails, can leave files that were never committed.
- A served ticket stays on the rail (`served`) until the poll sees its issue closed;
  `ticket.left` then erases its pass line.

## The five decisions

1. **Unpushed work is kept and reported, never destroyed** — served ticket included.
2. **"Unpushed"**: commits absent from origin, modified tracked files, or new files that are not
   ignored. What the project ignores does not count, and goes with the worktree.
3. **Said, and found again**: one fact in the log per worktree, with its reason; a runtime
   warning; the list of kept worktrees in `status`. One issue comment, one per ticket,
   only for kept unpushed work.
4. **PR still open** (ticket gone without being served): kept, re-examined at the tick, at most one
   GitHub read per kept ticket per minute.
5. **The stock** is caught up at startup, under the same rules. A worktree the log does not
   know is never touched.

| Issue criterion | What carries it |
|---|---|
| Served: every cook's worktree and branch removed | The cleanup, run at the end of each pass of the pass: any `station_cooks` worktree whose ticket is `served` |
| Gone without being served: removed, or kept with the why | Same for a ticket that left the rail; `worktree.kept` (`pr-open`, `unpushed`) |
| Never a silent failure | `worktree.kept` (`failed`) with what git said, the warning, the `status` line; retried at every tick |
| Unpushed work is never destroyed without a signal | `depot.liberer` looks before removing, and removes nothing if anything remains |
| The doc says what remains | `docs/runtime.md`, "Ce qui reste après un ticket" and "Ce que la pass ne garantit pas" |

## What the dev settled

- **The cleanup is a step of the pass**, not one more subscriber to the wake-up: the pass only
  plays one pass at a time, so no worktree goes while gates or a reviewer are reading it. The
  startup pass is the one that catches up the stock.
- **Nothing is cleaned while the ticket is on the rail without being served** — 86 and escalations
  to the chef included: it can start again, and a send-back resumes its worktree. Nor while a cook
  of the ticket is still running (#127): the whole ticket waits for the next pass.
- **Nor while the station has not finished telling the end of an exited cook**: between `cook.exited`
  and `cook.reported`, it opens the PR and rereads the worktree. Without this wait, a ticket that
  left during its cook lost its worktree just before its PR opened. Only the cooks of the runtime's
  current life hold back: an end that a dead runtime did not tell will never be told.
- **"Absent from origin" is read in the clone, with no network**: a commit that no `origin/*`
  tracking branch reaches. The station's push updates those branches; a remote branch
  deleted at merge leaves its own in place, so merged work does not pass for unpushed. Limit: a
  `git fetch --prune` played by hand in the station's clone makes those worktrees be kept — kept
  wrongly, never destroyed wrongly.
- **A worktree directory that is no longer a git worktree** (a half-done removal) goes if it
  is empty; otherwise it is kept as unpushed work.
- **The PR is only read for a ticket gone without being served, and only on a branch whose PR the
  station knew**. A ticket with several open PRs rereads them in turn, one per tick.
  A PR seen closed is not reread.
- **The log does not repeat**: `worktree.kept` is written when the reason changes, not at every tick.
  The warning follows the fact.
- **One comment per ticket**: the first kept unpushed work of a ticket is commented, along with
  all that is found in the same pass. A comment that fails is not retried — the log and
  `status` remain.
- **Lifting a hold is a chef action in the clone** (`git worktree remove --force`, `git branch
  -D`, or pushing the branch): the next tick notices and writes `worktree.removed`. No
  dedicated command.
- **A worktree already absent** (#62) is not a failure: its local branch goes if it is pushed,
  and the fact is written all the same, so as not to come back to it.
- **`depot.liberer` refuses a path outside the worktrees directory**: the log says what to
  remove, the repository checks where.

## Plan

1. `evenements/nettoyage.ts`, `projections/nettoyage.ts`: `worktree.removed`, `worktree.kept`; the
   table of each worktree's fate.
2. `depot.liberer(worktree, branche)`: in the repository queue; returns what remains unpushed, or
   nothing once the worktree and the branch are removed. Tests on a real repository.
3. `nettoyage.ts`: who is to be cleaned, the PR, the action, the facts, the warning, the
   comment. Tests on a hand-written log and a fake repository — no extra kitchen.
4. `pass.ts`: the step at the end of the pass. One assertion in an existing pass kitchen.
5. `etat.ts`: the kept worktrees in `status`.
6. `docs/runtime.md`.

## Out of scope

Remote branches (GitHub repository setting: delete on merge); the worktrees of failed cooks of
a ticket still on the rail, which pile up as long as it is neither served nor gone.
