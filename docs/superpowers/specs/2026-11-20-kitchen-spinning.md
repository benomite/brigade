# The kitchen spins on itself — freeze, delete, one supervisor

Date: 2026-11-20 · Epic: #3904 · Status: **validated by the chef on 2026-11-20 (answers below)**

## Why

On 2026-11-20 the chef said the kitchen "goes round in circles", and that the cause runs deeper than one bug. The figures agree.

**Measured over 14 days (2026-11-06 → 2026-11-20).** 793 issues were opened and 579 PRs were merged. At least 136 of those issues are tickets the kitchen filed about itself:

| Auto-filed family | Tickets | How they ended | Code they delivered |
|---|---|---|---|
| « Quality before time: first-try rate… » | 60 | 41 completed, 19 not planned; 18 identical ones for one project | 43 PRs, +1,619 −204 |
| « Tickets lose too much time… » | 27 | 26 completed, 1 open. Each one found the same cause: "waiting for a claim weighs most" | 24 PRs, +4,458 −712 |
| « Repair main: <check> » | 25 | 24 completed, 1 reopened; duplicates such as #3888/#3889 | — |
| « Closing pass on `main` » | 13 | 12 completed | — |
| « The kitchen is idle… » | 6 | 5 completed, 1 open | 5 PRs, +253 −37 |
| « #N loops… » | 5 | 5 completed; in BOBL-tech/mirrorlab, loop tickets spawned more loop tickets | — |

Repeating the same diagnosis 26 times shows that a ticket fixed nothing: the measure kept filing, and the cooks kept adding code.

**The mechanisms produce the next outages.** The frozen-test chain is the clearest case:

1. The manager writes the frozen tests first (#3725).
2. The pass refuses any delivery that touched them (#3726).
3. An amendment flow was added (#3729).
4. That guard then refused the manager's own amendment (#3842, #3843, #3850), then the chef's (#3835).
5. The frozen-test commit was then counted as the cook's (#3781, #3794 still open).
6. Finally, a cook "restored" a frozen test to the wrong version (#3833).

Each step stopped deliveries for hours. Other cases:
- On 2026-11-19, #3888 asked the chef to run read commands, because a cook decided the CI logs were empty when they were not. `main` stayed red for 17 h over a flaky test that a single rerun turned green.
- On the night of 19–20 Nov., in mirrorlab, about 100 CI runs were wasted on one gate before anyone looked.

**Size.** About 31 self-supervision mechanisms take about 18,300 lines of `runtime/src` (19.7 % of 92,992) and about 20,800 lines of tests (18.6 %). This does not count their wiring in `brigade-github.ts` (3,795 lines).

## Diagnosis

1. **Every symptom gets a new mechanism.** Each outage becomes a ticket, and each ticket adds a rule, a guard or an alert. These rules interact, and their interactions are the next outages. This runs against the first goal, simplification.
2. **Alerts become tickets on the very rail they describe.** A stuck kitchen files tickets meant to unstick it, but it cannot cook them. They pile up, sometimes in loops.
3. **No one owns the outcome.** Each actor applies its local rule: the cook relaunches, the pass refuses, a detector files a ticket. No actor looks at the whole and says "nothing has moved for 2 h; here is why; here is what I do". Today that role falls to the second when the chef asks, or to the chef's mailbox.

## Decision (chef, 2026-11-20): option C

**A — Freeze and delete first.** Then **B — one supervisor** replaces what remains of the detectors.

### The freeze, effective now

While #3904 is open:
- A ticket about the kitchen's own supervision goes on the rail only if it deletes more `runtime/src` lines than it adds, or if it fixes a bug in a mechanism this spec keeps.
- The second and the manager apply this rule at triage.
- Tickets that only add a mechanism wait for this spec. That is the case of the deliveries of #3891, #3893, #3895 and #3898: they come off the rail and are not merged.

## Inventory and verdicts

Sizes are lines of `runtime/src` / lines of `runtime/test`. "Fold" means the mechanism's detection moves into the supervisor and its code goes.

| # | Mechanism | Size | Cost seen | Verdict |
|---|---|---|---|---|
| 5 | Lost-time measure, filed as `prio:0` tickets (`temps-max/`, `routage-temps-perdu`, `refile-served-elsewhere`) | 774 / 792 | 27 tickets, +4,458 lines, same diagnosis each time | **Keep the measure, delete the filing** — the correction tickets and their routing go (Q3) |
| 5b | Cooking-time alert (`alerte-temps-cuisson/`) | 212 / 199 | correction tickets | **Delete** — its measure overlaps 5 |
| 5c | Quality before time, alert and weekly report (`alerte-qualite`, `mesure-qualite`, `qualite-github`, `rapport-hebdo-qualite`) | 716 / 747 | 60 tickets, 19 not planned | **Keep the measure, delete the alert** — no ticket is filed (Q3) |
| 8b | Drift thresholds (`derive`, `closer-github-durees/derive`, `derive-github`) | 340 / 273 | log lines nobody reads | **Delete** |
| 11 | `autonomie/` (table, routing, daily report, figures) | 569 / 793 | `aiguiller` is called nowhere | **Keep the figures, delete the dead routing** — the figures are the proofs of autonomy (Q3) |
| 4 | Idle-kitchen ticket (`cuisine-inerte`, `alerte-cuisine`) | 227 / 314 | 6 tickets | **Fold** |
| 2 | Loop tickets (`guerison/relance.ts` filing « #N loops ») | part of 903 / 1,092 | 5 tickets + the mirrorlab cascade | **Fold** — the rest of healing (stale claims, finished epics, ready PRs) stays |
| 3 | Repair-main tickets (`reparation-base/`, `base-rouge/`, `relance-main-rouge`) | 761 / 852 | 25 tickets, duplicates, a 17 h stop on a flaky test | **Fold** — the supervisor reruns first, then files at most one repair ticket per red check |
| 4b | Emergency alert (`urgence`, `alerte-urgence`) | 241 / 454 | overlaps 10c | **Fold** |
| 10a | Rail alerts (`attente-du-rail/alertes`) | 549 / 920 | the FAULT banners the chef "doesn't know what to do with" | **Fold** — the queue keeps saying what waits; the supervisor says what it did |
| 10b | Stuck rail (`rail-bloque/`) | 420 / 362 | overlaps 10c | **Fold** |
| 10c | Held kitchen (`retenue/`) | 939 / 1,003 | third "nothing moves" detector | **Fold** — it becomes the supervisor's single trigger |
| 1b | Frozen-test guard: refusal and fixing of wrong frozen tests (`passe-gel-tests/`) | 325 / 836 | the chain above: ≥ 8 tickets, several stops | **Simplify** — a touched frozen test becomes a blocking review finding, judged like any other; no automatic refusal or repair. *Chef's decision, Q1* |
| 1c | Amendment (`amendement/`) | 374 / 340 | #3764, #3833, #3849 stuck on it | **Delete** with 1b — a wrong criterion is a send-back reason or a card, like any other |
| 1a | Tests-written step (`tests-acceptation/`) | 379 / 380 | waiting on the manager before any cook | **Keep** — it is the product contract |
| 7 | Breaker, caps, stall relaunch, breaker issue (`garde-fous`, `breaker-*`, `plafonds`) | 1,744 / 2,522 | the breaker waits for the chef to reset it | **Simplify** — caps stay (quota safety); the supervisor closes the breaker, and the breaker issue goes |
| 6 | Set-aside (`set-aside:failures`, `served-elsewhere`, `blocked-on-human`) | 497 / 658 | set-aside tickets read as queued (#3875), relaunched in loops | **Simplify** — a ticket set aside goes to the supervisor, never back to the rail by a timer |
| 8 | Closing pass | 2,027 / 1,689 | 13 tickets, 12 served | **Keep** — it is the deletion engine |
| 7b | Process supervisor (kills a silent cook) | 671 / 548 | — | **Keep** |
| 9a–9e | Red-on-main proof, mutations, review, epic diagram, design review | 2,736 / 2,738 | #3785 (design review E2BIG, open) | **Keep**, and fix #3785; re-measure in a month |
| 10d–10j | Cook tool guard, wait-loop breaker, main conflict, red-delivery naming, resumes, remedies, machine watch | 3,018 / 3,293 | — | **Keep** |

**Expected deletion:** about 2,000 lines of `runtime/src` deleted outright (the filing part of 5 and 5c, 5b, 8b, the dead routing of 11, 1c and part of 1b). The measure code stays as the proofs of autonomy. About 3,100 more are folded into a supervisor of a few hundred lines (4, 2-loops, 3, 4b, 10a, 10b, 10c).

## B — the supervisor

One trigger, one actor, a fixed set of gestures.

- **Trigger.** It fires on a project when any of these holds:
  - nothing has been merged for 30 min while a ticket is cookable;
  - a ticket has been taken 3 times without delivering;
  - `main` has been red for 10 min.

  Only one supervisor run per project at a time.
- **Actor.** The project's manager receives a dossier:
  - the queue;
  - the tail of the journal;
  - the failing CI step and its log lines, read with `gh run view --log-failed`;
  - the history of the ticket at fault.
- **Gestures**, the only ones allowed:
  1. rerun failed CI jobs;
  2. put a ticket back on the rail with a note;
  3. set a ticket aside in WAITING for a named third party;
  4. close a duplicate or a stale alert;
  5. file **one** `fix` ticket for a new cause, after checking that no open ticket has the same cause;
  6. post a TODO card only for a product or design question.
- **Trace.** The supervisor writes what it saw and what it did as one comment on the ticket it acted on. It never files a ticket automatically, and never a ticket about a ticket.
- **Never.** It never asks the chef for a technical gesture: no rerun, merge, rebase or log reading. That rule already exists; the supervisor is where it is enforced.

## Order of the tickets (after validation)

1. **Delete** the ticket filing of 5 and 5c, then 5b, 8b and the dead routing of 11. This is pure deletion, so it may go first at `prio:0`.
2. **Supervisor**: its trigger replaces 10c, and its gestures replace 3 and the loop tickets of 2. Then delete 4, 4b, 10a, 10b and the code it replaces.
3. **Frozen tests**: simplify 1b and delete 1c, according to Q1.
4. **Breaker and set-aside**: the supervisor closes the breaker; set-aside tickets go to it.

## The chef's answers (2026-11-20)

- **Q1 — frozen tests.** The chef chose to keep the tests written first (1a), to turn the guard into a review finding (1b), and to delete the amendment (1c).
- **Q2 — the supervisor's thresholds.** The chef approved them: 30 min without a merge, 3 takes, 10 min of red `main`.
- **Q3 — the figures.** The chef wants to keep them as the proofs of autonomy (first-try rate, lost time). They stay measured, but they are never filed as tickets. Showing them is welcome but not part of this epic: little or nothing is shown today. A separate `product` ticket will decide where they are shown.
