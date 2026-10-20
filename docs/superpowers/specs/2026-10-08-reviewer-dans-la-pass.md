# The reviewer reads the diff, and alone judges tickets with no diff — spec and plan (#72)

**Date**: 2026-10-08
**Status**: delivered — the decisions of the first section are those of the issue and its
qualification; the choices in the section "What the dev settled" can be contested in review
**Issue**: #72 "The reviewer reads the diff, and alone judges tickets with no diff" (milestone 2)
**Builds on**: `2026-10-08-brigade-v2-design.md` (§The pass, §Tickets with no diff — brought into
line with this ticket by the same PR), `2026-10-08-pass-et-grant-merge.md` (milestone 1's pass),
`2026-10-08-manager-qualifie-et-calibre.md` (a judgment launched like a cook outside a ticket — precedent
imitated), `2026-10-08-garde-fous.md` (caps, breaker, "stop").

---

## What was decided

| # | Decision | Source |
|---|---|---|
| 1 | After **green gates**, a reviewer reads the diff; its findings enter the verdict. | issue |
| 2 | A **blocking** finding turns the pass red, gates green or not, and uses up a send-back like a red gate — same limit of two. | issue, qualification |
| 3 | The reviewer is **mandatory on a ticket with no diff**: never "served" without a review. The V2 spec said the opposite; this ticket prevails. | issue (decision of 2026-10-08, PR #44) |
| 4 | The cook does not review itself. In V2, another Claude; another engine is parked. | issue |
| 5 | The chef reads what the reviewer said on the issue or the PR, without opening the log. | issue |
| 6 | Its calibration is explicit, with no default, set by runtime configuration — refusal to start if it is missing —, and in the log. | issue, qualification |
| 7 | The verdict says what produced it: which gate, which CI job, which finding. | issue |
| 8 | `judge-modified` stays: a green reviewer lifts nothing. An unreadable output is **neither green nor red**: it escalates. | qualification |

## What the dev settled

| # | Choice | Why |
|---|---|---|
| a | **The reviewer goes before the CI is read**, not after. A blocking finding does not wait for a CI still running. | The CI concludes during the review, and a cook sent back restarts with everything that was found — a send-back costs a whole cook, a review far less. Price: a review paid for on a delivery that the CI would have reddened on its own. |
| b | **No review without green gates**: red gates, dirty worktree, conflict with the base. | The cook will come back anyway with another commit, which will be reviewed. |
| c | **A ticket with no diff is recognised by the worktree**: the cook concluded, left a report, and committed nothing. Nothing declares it in advance. | The spec: "a non-code cook is a cook whose diff is empty". Consequence: a cook that commits nothing on a code ticket goes to the pass as such, and it is the reviewer who says the ticket is not fulfilled — instead of the old `no-commit` failure, which relaunched a cook without telling it anything. With **neither** a commit nor a report, it is still a failure; and a worktree that carries modified or new files never committed is **never** without a diff (review finding, send-back 1): `no-commit` at the station, red without a reviewer at the pass. |
| d | **Green and with no diff: served without merge, without grant, issue closed** (`pass.served`). | The grant covers a merge; there is nothing to merge. The deliverable stays on the issue. |
| e | **Three reading tools** (`Read`, `Grep`, `Glob`), in the delivery's worktree; the diff is in the prompt, cut at 40,000 bytes, the file list at 8,000. | "Without write access" by construction, with no shell. The caps, in bytes, keep the prompt within a command argument (128 KB under Linux); beyond that, it reads the delivered files. A prompt of more than 120,000 bytes despite them is not launched: escalation `review-unsendable`, not a loop of failures (review finding, send-back 1). |
| f | **The answer is a JSON object**: `verdict` (`vert`/`rouge`), `resume`, `constats[]` (`gravite`: `bloquant`/`remarque`, `fichier`, `constat`). The verdict is redundant with the findings, on purpose: if they contradict each other, the answer is unreadable. | Nothing is guessed. |
| g | **One review per delivery** — the cook's run and its commit —, in the log (`pass.reviewed`). | It costs quota: neither a slow CI nor a restart must redo it. The gates, free, remain an in-memory cache. |
| h | **Launched like a manager judgment**: `cook.launched` outside a ticket, station `reviewer`, run `review-<ticket>-…`, under guardrails; it does not take place under "stop", breaker, quota or disconnection. | Precedent #69. Outside a ticket because the ticket already has its cook: it is `pass.reviewed` that attaches the review to its delivery. |
| i | **Only blocking findings go back to the cook**; remarks stay on the issue. | A send-back cook is "fix what the pass found, and nothing else". |
| j | **The reviewer reads the ticket** (body, trusted comments other than the brigade's) **and the cook's report**, as data. | Reading a diff without knowing what was asked does not say whether it does it. |
| k | Variables: `BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT`. | The pattern of `BRIGADE_MANAGER_*`. |

## Plan

1. `runtime/src/reviewer.ts` — no I/O: configuration, `claude` arguments, prompt, reading of
   the answer.
2. `evenements/pass.ts`, `projections/pass.ts` — `pass.reviewed`, `pass.served`, `review` and
   `noDiff` in `pass.judged`, the `served` phase, the reason `review-unreadable`.
3. `pass.ts` — the review after green gates; the judgment of a ticket with no diff; serving
   without merge.
4. `station.ts` — a cook that concludes without a commit, with a report, goes to the pass (`no-diff`),
   with no push or PR.
5. `depot.ts` (`diff`), `github.ts` (an issue's body), `main.ts` and the systemd unit (the two
   variables), `montrer-pass.ts` (what the chef reads).
6. `docs/runtime.md`, and the V2 spec brought into line.

## Out of scope

A reviewer of another engine. The batch of tickets merged in one go. The manager (#69): the pass remains
a runtime tool, without it. Declaring in advance that a ticket has no diff.
