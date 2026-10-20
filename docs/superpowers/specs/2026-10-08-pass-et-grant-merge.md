# The pass and the `merge` grant — spec and plan (#17)

**Date**: 2026-10-08
**Status**: approved on 2026-10-08 — (a) to the eight questions at the end of the document
**Issue**: #17 "The pass judges the delivery, and merges under a grant"
**Builds on**: `2026-10-08-brigade-v2-design.md` (§The pass, §Delegation charter and grants,
§Isolation and secrets), `2026-10-08-runtime-stack.md` (§2, two-step effects),
`2026-10-08-station-claude.md` (the station delivers: branch pushed, PR opened, `ticket.passing`)

---

## What #17 delivers

Today a delivered ticket stays "in pass", its PR open, and nothing judges it. #17 adds the **pass**
to the runtime: as soon as a cook has delivered, it plays the project's gates in its worktree,
reads the CI of its commit, writes a verdict, then decides — merge if the `merge` grant is active,
stop and say so otherwise, send back to the cook if it is red, escalate to the chef after two
send-backs.

| Issue criterion | What carries it |
|---|---|
| Gates played and CI read without the chef | The pass wakes on every delivery (`cook.reported`, end `done`) and on every tick |
| Verdict logged with what produced it | Fact `pass.judged`: per judge (gates, CI), its outcome, the `FAIL` lines and the tail of the gates output, each CI job with its conclusion and its address |
| A `merge` grant, a runtime object, enabled and revoked live, state visible | Facts `grant.activated` / `grant.revoked`, `grants` projection, `npm run grant` command |
| Consulted at every merge decision | Read in the transaction that writes the intent to merge — never kept in memory |
| Active grant + green → merge, ticket "served" | `grant.used`, merge through the API, `merge.done`, `ticket.served`, issue closed |
| No grant + green → the pass stops and says so | `pass.held`, reason `no-grant`, comment on the ticket |
| PR to the base; a PR to `main` refused | The PR's base is re-read on GitHub before any judging (question 6) |
| Every use of the grant logged | `grant.used`: ticket, PR, commit, sequence number of the verdict that authorizes it, timestamp |
| No cook merges | Branch protection — the chef's action, question 7; what the code guarantees and does not guarantee is stated there |
| Red: findings to the cook, two send-backs, then the chef | `pass.returned` (send-back number, findings); at the third red verdict, `pass.escalated` |
| The chef sees the send-backs used | `pass` projection, `npm run pass` command |
| No quota | The pass launches neither `claude` nor any model. Only a send-back consumes any: that is a cook |

## What was checked before writing

- The `benomite/brigade` repository is **public**, its default branch is `main`, and **neither
  `main` nor `v2` is protected** today (`gh api …/branches/v2/protection` → 404).
- `gh` on the workstation is logged in as `benomite`, the repository's owner. If the box is too,
  **the cook and the pass have the same GitHub identity**: see question 7.
- The repository has **no CI** (`.github/workflows` absent).
- The repository's gates require a **prepared** worktree: without `worktree-setup.sh`, the type
  check is "unplayable" and the gates come out red. The station does not play that setup today.

## The course of a delivery

1. **Find the delivery**: the run, its branch and its worktree (`cook.launched`), then the PR,
   re-read on GitHub by its branch (`pulls?head=<owner>:<branch>`). Absent — its opening had
   failed — the pass opens it. GitHub unreachable: nothing is written, the next tick retries.
2. **Refusal without judging**: the PR does not target the base (question 6); the project has no
   gates (question 3). These are not the cook's faults: the pass escalates to the chef, with no
   send-back.
3. **Gates**: `.claude/brigade/worktree-setup.sh <ticket> <worktree>` if it exists, then
   `.claude/brigade/gates.sh <worktree>` — the V1 contract, **the exit code is the verdict**. In
   the cook's worktree, under a cook's environment (no `BRIGADE_*`, no token). Before playing them,
   the pass checks that no tracked file in it is modified — otherwise the gates would judge
   something other than what is committed, and that is a finding. The judged commit is the
   worktree's `HEAD`: it is the one the merge will require. Duration cap: 30 minutes
   (`BRIGADE_GATES_TIMEOUT_SECONDS`), beyond that it is red.
4. **CI**, only if the gates are green: the *check runs* and statuses of the judged commit.
   - a failing job → **red**, with its name, its conclusion, its address;
   - jobs still running → **no verdict**: re-read at the next tick (question 4 for the cap);
   - all green → green;
   - **no check at all** → named case `none`, neither green nor red: the verdict rests on the
     gates alone, and says so (`ci: none`). Unless the worktree carries workflows
     (`.github/workflows/*.yml`): checks are then expected, and their absence means "running", not
     "none".
5. **Verdict**: `pass.judged`, green or red. Conflict with the base (`mergeable: false`): red.
6. **Decision**, in a single transaction with the reading of the grant:

| Verdict | `merge` grant | What the pass does |
|---|---|---|
| green | active | `grant.used` (the intent), merge of the PR **on the judged commit**, `merge.done`, `ticket.served`, issue closed, comment |
| green | absent or revoked | `pass.held` reason `no-grant`, comment "PR open, green, not merged: no grant" |
| red, send-backs < 2 | — | `pass.returned`, findings as a comment, ticket given back to the rail: the station launches a cook on it again (question 2) |
| red, 2 send-backs already used | — | `pass.escalated`, ticket 86 reason `pass:returns-exhausted`, comment. Nothing is merged |

**The merge is a two-step effect.** `grant.used` is written *before* the call to GitHub, with the
PR and the commit; `merge.done` or `merge.failed` after. The merge itself requires the judged
commit (`sha`): GitHub refuses if the branch has moved since the verdict. An intent without a
result — runtime dead between the two — is reconciled by re-reading the PR: merged, the pass
writes `merge.done` and serves the ticket; not merged, `merge.failed` reason `interrupted`, and
the decision is taken again (grant re-read). GitHub refuses to merge the same PR twice: never two
merges, never a merge without a trace. A merge **refused** by GitHub (protection, moved commit) is
not retried in a loop: `pass.held`, with the reason GitHub gave.

**After the merge**, the pass closes the issue itself (`Closes` only acts on the default branch):
the ticket is "served", then leaves the rail at the next poll.

**A ticket the pass has stopped** (`held`, `escalated`) stays watched: on every tick its PR is
re-read, and if the chef has merged it by hand, the pass writes `merge.done` (merge author:
outside the runtime), serves the ticket and closes the issue. This is the normal exit of a green
ticket without a grant.

## The `merge` grant

The bare minimum: exist, be consulted, be revocable, be logged.

- Two facts written by the CLI, author `chef`: `grant.activated` and `grant.revoked`, payload
  `{ action: "merge" }`. A third written by the pass: `grant.used`.
- The scope is the project (one log per project) and the configured base. No duration, no counter.
- **Absent by default**: a new runtime merges nothing.
- The pass reads it in the database at the moment of deciding: a revocation applies from the next
  decision, without a restart. A revocation that arrives *after* `grant.used` does not cancel the
  merge in progress.

```
npm --prefix runtime run grant                    the grant's state, since when, and its ten latest uses
npm --prefix runtime run grant -- enable merge
npm --prefix runtime run grant -- revoke merge
npm --prefix runtime run pass                     the tickets in pass: phase, verdict, send-backs n/2, PR
npm --prefix runtime run pass -- <ticket>         a ticket's story: each verdict and what produced it
```

"Why is this code on `v2`?": `npm run grant` lists the uses (ticket, PR, commit, verdict, time),
`npm run pass -- <ticket>` shows the cited verdict.

## Logged facts

| Fact | Ticket | Payload | Author |
|---|---|---|---|
| `grant.activated` / `grant.revoked` | — | `action` | `chef` |
| `pass.started` | yes | `run`, `pr`, `number`, `sha` | `pass` |
| `pass.judged` | yes | `run`, `pr`, `number`, `sha`, `verdict` (`green`, `red`), `gates` (`outcome`, `code`, `failures`, `tail`), `ci` (`outcome`: `green`, `red`, `none`, `skipped`; `checks`), `findings`, `judgeModified` | `pass` |
| `grant.used` | yes | `action`, `pr`, `number`, `sha`, `base`, `verdict` (sequence number of the `pass.judged`) | `pass` |
| `merge.done` | yes | `pr`, `sha`, `by` (`pass`, `outside`), `reconciled` | `pass` |
| `merge.failed` | yes | `pr`, `sha`, `reason` | `pass` |
| `pass.held` | yes | `reason` (`no-grant`, `judge-modified`, `merge-refused: …`) | `pass` |
| `pass.returned` | yes | `n` (1 or 2), `findings` | `pass` |
| `pass.escalated` | yes | `reason` (`returns-exhausted`, `wrong-base`, `no-gates`, `ci-silent`) | `pass` |

`ticket.served` and `ticket.86` already exist; the rail now accepts that a ticket **in pass** goes
86 through the runtime. A red ticket goes back to queued through `ticket.released`, reason
`pass-red`; an escalated ticket goes 86, reason `pass:<reason>`.

## Modules

| File | Role |
|---|---|
| `src/evenements/pass.ts` | The pass's and the grant's facts |
| `src/projections/pass.ts` | Per ticket: the delivery, the phase, the latest verdict, the send-backs. And the grant's state, its uses |
| `src/gates.ts` | Play setup and gates in a worktree, under a cap; extract the outcome, the `FAIL` lines, the tail of the output. The only module that launches the project's scripts |
| `src/pass.ts` | The loop: find, judge, decide, merge, reconcile |
| `src/grant-cli.ts`, `src/montrer-pass.ts` | The two commands |

Touched: `github.ts` (read a PR by branch, read a commit's CI, merge, close an issue), `depot.ts`
(head commit and cleanliness of a worktree, files changed since the base), `rail.ts` (86 from the
pass), `station.ts` (resuming a sent-back ticket: same worktree, same branch, send-back
instruction, PR already open; waking the pass at the end of a cook), `main.ts`, `docs/runtime.md`.
**`claude.ts` is not touched** (dev-41 is working on it): the send-back instruction lives with the
pass.

## What development made precise

- **Harvesting a send-back** (question 8). On a send-back, the commits of the refused delivery are
  already in the worktree: the station only harvests if there is **one more commit**. Without
  that, a send-back cook dead at launch would have "delivered" the same commit, and used up a
  send-back. A send-back cook that *concludes* without committing anything still goes back to
  pass: it holds the finding to be false, and the pass judges again.
- **A vanished send-back worktree**: the cook starts again from the base on a new branch, and it
  is a new delivery — neither the PR nor the commit judged concern it, the send-back has no
  object left. The send-backs already used stay counted.
- **"Touches its judges" is read without rename detection**: moving or deleting a workflow or the
  gates counts as touching them.
- **The gates' verdict is their exit code, known as soon as they end**: what they leave running in
  the background is killed with their group, and does not hold the pass until the cap.
- **A cook's branch is force-pushed.** A conflict with the base is fixed by a rebase, which a
  plain push would refuse. The `cook/<run>` branch belongs only to the station.
- **The pass is woken by the station** at the end of each cook, without waiting for the tick. In
  the other direction — a sent-back ticket, to be resumed — the station waits for the tick: a
  minute at most.
- **A `mergeable` that GitHub has not yet computed** does not hold back the verdict: if the branch
  conflicts, it is the merge that will be refused, and the pass stops (`merge-refused`).
- **The window left by #15** — runtime dead between `ticket.passing` and `cook.reported` — is not
  closed by this ticket: the pass starts from `cook.reported`. It is closed by #50: at startup,
  the station resumes such a ticket, finds or opens its PR and writes the report
  (`reconciled: true`) — see `docs/runtime.md`.

## What this ticket does not do

- **Reviewer, LLM judging**: milestone 2. At milestone 1, green means "the gates and the CI found
  nothing", not "someone reviewed".
- **Raising the calibration at the second send-back** (§The pass): the issue does not ask for it;
  both send-backs go out at the ticket's calibration.
- **Branch up to date with the base**: the gates judge the cook's branch, not the result of the
  merge. A conflict is seen (red); a regression born from two clean merges meeting is not. With a
  single cook at a time the risk comes from PRs merged by hand on `v2` during the build.
  Tightening it ("up-to-date branch required") is a branch protection setting.
- **The cleanup** of worktrees and merged branches.
- **A PR closed without merge by the chef**: the ticket stays in pass; removing `fire` takes it
  off the rail.

## Plan

Each step: the test first, red, then the code. No network, no real merge, no real `claude`.

1. Facts and projection: grant (enabled, revoked, uses), pass (phase, verdict, send-backs); replay.
2. `npm run grant`: state, enable, revoke — written to the log of a running runtime.
3. `gates.ts`: green, red with its `FAIL` lines, absent, duration cap, setup played before.
4. `github.ts`: PR by branch, a commit's CI (green, red, running, none), merge, closing.
5. The pass, verdicts: red gates, red CI, CI running then green, no check, wrong base.
6. The pass, decisions: green + grant → merge, served, issue closed; green without a grant → stop
   stated; revocation between two deliveries; `grant.used` before the call.
7. Reconciliation: intent without a result, PR merged or not; PR merged by hand.
8. Send-backs: findings to the cook in the same worktree, counter, third red → escalation, 86.
9. `npm run pass`, `main.ts`, `docs/runtime.md` (the pass, the grant, the chef's recipe).

## Questions for the chef

Each has a recommended answer, **(a)**. "(a) everywhere" is enough.

**1. Is a green ticket stopped for lack of a grant merged when the grant is enabled afterwards?**
- **(a) No.** The decision is taken once, at the verdict. Enabling the grant applies to the
  following verdicts; the PRs already stopped, the chef merges by hand — the pass sees it, serves
  the ticket and closes the issue. Reason: without a reviewer, enabling a grant must not make code
  judged under another regime land all at once, possibly hours earlier.
- (b) Yes: on enabling, every PR stopped for `no-grant` whose commit has not moved is merged.
  Fewer actions for the chef, but the grant becomes retroactive.

**2. "The findings go back to the cook that delivered": which cook?**
The cook's process is dead when the pass judges.
- **(a) A new cook, in the same worktree, on the same branch, the same PR**, with a send-back
  instruction carrying the findings (also posted as a comment on the ticket). It finds the work,
  not the conversation. The ticket goes back through the rail: the station takes it again in its
  turn, under the same guardrails.
- (b) The cook's session resumed (`claude --resume`): it keeps its context, but that whole
  context is re-read and re-paid, the cache being cold after the gates; it depends on how sessions
  are stored on the box, and can only be tested by burning quota.

**3. A project without `gates.sh`: green, red, or something else?**
- **(a) Neither: the pass refuses to judge and escalates to the chef** (`no-gates`), with no
  send-back. Without gates and without CI, "green" would mean "nobody looked", and the grant would
  merge code never judged.
- (b) Green if the CI is green, escalated only if there are neither gates nor CI.

**4. A CI that never answers?**
- **(a) Thirty minutes of waiting at most** (`BRIGADE_CI_WAIT_SECONDS`), then escalation to the
  chef (`ci-silent`), with no send-back: the cook will not be the one to unblock it.
- (b) Wait without limit: the ticket stays in pass, visible in `npm run pass`.

**5. A cook that modifies its own judges.**
The gates played are those **of the cook's branch**. A delivery that touches `.claude/brigade/` or
`.github/workflows/` can make itself green, and without a reviewer nothing would see it.
- **(a) Such a delivery is never merged by the pass**: green, it is stopped (`pass.held`, reason
  `judge-modified`) and the chef merges. Tickets that evolve the gates remain possible, they
  need a look.
- (b) Play the base's gates rather than the branch's: a ticket that adds a gate would then never
  be judged by it.
- (c) Do nothing at milestone 1.

**6. "A PR that would target `main` is refused": `main` hard-coded, or the configured base?**
- **(a) The pass refuses any PR whose base is not `BRIGADE_BASE_BRANCH`** (`v2` for the pilot) —
  escalated `wrong-base`. `main` is therefore refused here, without being hard-coded: a project
  whose base *is* `main` will remain servable when the day comes.
- (b) In addition, refuse to merge on the repository's default branch, whatever the configuration,
  as long as milestone 1 lasts.

**7. Branch protection of `v2` — your action, not mine.**
What to know before choosing: on the box, cook and pass go through the same `gh`, hence the same
identity. **No branch protection can then tell one from the other**: it can forbid direct pushes
to `v2`, not reserve the merge for the pass. The hard guarantee will come with the GitHub App
(milestone 7, tokens limited per role); until then, what holds a cook back from `gh pr merge` is
#15's list of forbidden tools, in good faith.
- **(a) Protect `v2`: PR required, zero approvals required, administrators included.** No more
  direct push, including by a cook or by mistake; PR merges — the pass's, yours, the V1 Manager's
  — go through. I give you the command in the recipe; you play it.
  ⚠️ To check on your side: nothing in the V2 build pushes directly to `v2`.
- (b) Protect nothing at milestone 1 and write it down as a known limit.

**8. Two send-backs: what uses one up?**
- **(a) Only a red verdict from the pass.** A send-back cook that fails without delivering anything
  does not use up a send-back: it goes back to queued and it is #16's breaker that bounds it. A
  ticket therefore costs at most three red verdicts before escalating.
- (b) Any cook relaunched on the ticket counts.
