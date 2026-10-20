# The manager reacts to a failure instead of escalating it

Issue #74 — epic #75 (milestone 2). Reference spec: `2026-10-08-brigade-v2-design.md`, §The
manager ("reacts to failures: re-splits, changes cook profile, escalates to the second") and §The
pass ("the two returns are not two identical attempts").

## The problem

The pass sends the findings back twice to a cook, at the same calibration, then escalates to the
chef (`returns-exhausted`). Nobody decides anything: a manager that only knows how to escalate is
a switch.

## Decisions (validated on 2026-10-08)

1. **An LLM judgment chooses**, the code holds the invariants. Past the two returns, the manager
   asks its LLM — one call, at the `BRIGADE_MANAGER_*` calibration, no tools — to choose between
   **raising** the calibration, **re-splitting** the ticket, or **escalating** to the chef. An
   unreadable answer, or an impossible choice (raising at the ceiling, re-splitting a ticket
   already born of a re-split), counts as an escalation.
2. **The calibration ceiling** is a project setting: `BRIGADE_CEILING_MODEL` and
   `BRIGADE_CEILING_EFFORT`, optional, **with no default**. A dimension with no ceiling never
   goes up; the manager says so.
3. **Raise by one notch**: effort first (`low < medium < high < xhigh < max`), then the model
   (`haiku < sonnet < opus`) keeping the effort reached. The chef's ceiling is authoritative,
   `xhigh` and `max` included.
4. **The chef's gesture is stronger.** The manager only replaces a calibration label that it
   placed itself (qualification, split, or earlier raise): it removes its own and places the
   next. A dimension placed by the chef is never touched.
5. **Manager off**: the pass behaves as before — two returns at the same calibration, then
   `returns-exhausted`.
6. **Re-split**: the ticket becomes the epic of its sub-tickets (split machinery reused). It goes
   86 (`manager:split`), its PR stays open, and **it no longer holds a zone**: its sub-tickets,
   which cover it, leave. A ticket born of such a re-split is not re-split (depth 1).
7. **The breaker has the last word.** A delivery judged red, when it comes from a relaunch
   decided by the manager, counts as a failure; the cook that delivered it does not reset the
   counter. Breaker open, the manager relaunches nothing more: it escalates. No per-ticket
   counter of reactions — the ceiling and depth 1 make the sequence finite.

## The path of a red ticket, manager on

| Red pass no. | What happens | Who |
|---|---|---|
| 1 | return 1/2, same calibration | the pass, as before |
| 2 | the pass **hands over** (`pass.deferred`); the manager raises by one notch if it can, then returns 2/2 — otherwise returns at the same calibration, saying why | code, no LLM |
| 3 and following | the pass hands over; the manager **chooses**: raise, re-split, escalate | an LLM judgment |

The pass no longer gives the ticket back to the rail itself from the second red on: the station
would take it again before the calibration had changed. The manager changes the labels, **waits
for the rail to have read the new calibration**, then gives the ticket back (`pass.returned`). A
ticket therefore never leaves identically: either its calibration has changed, or it is
re-split, or it is escalated. The only exception is the second return when nothing can go up —
that is the two-returns rule, and it is said.

## Facts in the log

- `pass.deferred` — the pass hands over to the manager (phase `deferred`).
- `manager.reacted` — `{ verdict, returns, choice: retry | raise | split | escalate, reason,
  proposal, run, from, to }`. It is through this that the chef reads "why was this ticket
  split?". `run`: the judgment, null when the code decided alone.
- `manager.raised` — `{ added, removed }`: the labels changed, written once GitHub is served.
- `manager.reaction-commented` — the reaction is said on the issue.
- `pass.escalated` gains two reasons: `manager-split`, `manager-escalated`.
- `relaunch.judged` — `{ run, verdict }`: the pass's verdict on a manager relaunch, read by the
  breaker. `cook.launched` carries `relaunch: true` for such a cook.

## What the chef receives when the manager escalates

A comment on the issue: each attempt (calibration, what the pass found), what failed
last, and what the manager proposes.

## Plan

1. `reagir.ts` (pure) — scales, ceiling, `monter`, instruction and reading of the reaction.
2. Guardrails — `relaunch` on `cook.launched`, `relaunch.judged`, `jugerRelance`.
3. Rail — an 86 `manager:split` holds no zone.
4. Projections — `deferred` phase of the pass; `reactions`.
5. Pass — hands over to the manager when on; station: marks the relaunches.
6. GitHub — remove a label.
7. `reaction.ts` — the reaction loop, wired into the manager; `redecouper` in the split.
8. `main.ts`, `docs/runtime.md`.

Each step: the test first, seen red, then the code.

## Out of scope

The cook profiles (milestone 8): "changing profile" comes down here to changing calibration. The
cook that hands back control by itself asking for the raise (§The pass) is not handled here.
