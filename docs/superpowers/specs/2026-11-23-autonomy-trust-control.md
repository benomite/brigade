# Autonomy, trust, control — the three axes after the supervisor

Date: 2026-11-23 · Epic: #4019 · Status: **validated by the chef on 2026-11-23 (answers below)**

## Why

The spec of 2026-11-20 (`2026-11-20-kitchen-spinning.md`, #3904) froze the self-supervision mechanisms, deleted the ones that filed tickets, and put one supervisor in their place. Everything in it is delivered. Since 2026-11-21 the supervisor has turned a red `main` green by itself three times, with no repair ticket and no human.

That fixed the worst of it, but on 2026-11-22 the chef asked for the next step: make Brigade **much more autonomous**, make it **much more trustworthy** for its user, and give that user **a view of, and control over, every agent**, the autonomous ones above all (supervisor, closer, manager, pass).

### The one measure

**Outages the chef sees before the system does.** From 2026-11-19 to 2026-11-22, that was nearly all of them. The chef found each one through GitHub mails or a screenshot, and the second fixed it by hand. The target is zero. Every proposal below is judged by what it removes from that count.

### What those outages were (2026-11-19 → 22)

| Outage | Seen first by | Cost |
|---|---|---|
| A cook relaunched on a red CI about 35 times, never shown the failing test (#4001) | the second, by chance | 3.5 h, about 35 cook runs |
| Unclaimed tickets reserving file zones for each other in a cycle (#3979) | the chef (« démerde-toi pour faire repartir la cuisine ») | about 1.5 h with the kitchen frozen |
| A split epic's old PR holding the zone of its own tickets (mirrorlab #831, #3932) | the chef | 2 h with mirrorlab idle |
| Cook ↔ review loop on an unchanged commit, with the manager and the review contradicting each other (#3955, #3959) | the second | about 15 rounds in 40 min |
| Flaky tests turning `main` and every PR red (« #21 », the Windows 3 s family, the 30 s dispatch test) | the chef, by about 30 mails a day | each one a red `main` and mails |
| TODO cards asking the chef technical questions (#3888, #3910, #3911, #3947, #3949, #3960, #3965) | the chef | 7 cards answered by « close it » |
| Tickets parked by the second and never put back (night of 2026-11-20 → 21) | nobody, for 6 h | the kitchen empty all night |
| A board that only grows durations (« 1 h », « 1 d ») and never says what is happening | the chef: « on a l'impression que c'est bloqué » | trust |

Three causes run through the list:
1. **The state lives in scattered labels**, and each mechanism reads them its own way. Many bugs are a broken invariant, such as « a ticket nobody cooks holds a zone ».
2. **Supervision watches states, not progress**, so a ticket « taken » that moves nothing looks healthy.
3. **The chef sees results, never actors.** Nobody can tell what the supervisor or the closer did, why, or at what cost.

## Axis 1 — Autonomy

### A1. Invariants, checked all the time

**Ground:** 2026-11-20 and 2026-11-21: unclaimed tickets and a split epic's old PR holding file zones, each fixed by hand after the chef noticed (#3966 `a45974a`, #3932 `d783752`, #3974 `8a24916`, #3979 `5df4a7e`). Each fix is one broken invariant, repaired one case at a time.

Write down a short list of invariants of the rail and check them on every tick. When one breaks, the supervisor repairs it with its existing closed set of gestures. A new kind of bug becomes a new invariant, not a new mechanism. Each one is a sentence, a check and a repair:

- a ticket that no cook is cooking and that is not in pass holds no file zone and reserves none;
- the same failure on the same commit is never judged or relaunched twice;
- a `taken` ticket shows progress (a commit, a CI change, a review) within N minutes;
- a ticket set aside, parked or in WAITING has a named reason and a date to look at it again: nothing is parked « until someone remembers »;
- a red check on `main` is rerun once before anything else.

### A2. Supervise progress, not states

**Ground:** 2026-11-19 → 21: tickets that looked healthy while nothing moved — a `taken` ticket with no cook and no wait (#3883 `bb08533`, 2026-11-19) and the night of 2026-11-20 → 21 when tickets were parked and the kitchen stayed empty for 6 h (#3911 `35407a8`, the supervisor takes the tickets set aside).

The supervisor already wakes on « nothing merged for 30 min », « taken 3 times » and « `main` red for 10 min ». Add one generic trigger that covers the outages nobody foresaw: **no progress on a ticket for X minutes, whatever its state**. Progress means a new commit, a CI result, a review verdict or a label change made by an agent.

### A3. Never relaunch blind

**Ground:** 2026-11-21 → 22: a cook relaunched about 35 times on a red CI of #4001 without seeing the failing test (fixes #4006 `4dc780f`, #4007 `642d153`, #4008 `3171c05`, all 2026-11-22); 2026-11-20: a cook ↔ review loop on an unchanged commit (#3961 `9364563`, #3976 `cc0c2ee`).

Every relaunch carries the evidence of the failure: the failing check, its step and its log lines, or the review's blocking points. The same input with the same failure is not relaunched; it goes to the supervisor. #4006 to #4008 started this for red CI. The rule is general.

### A4. The CI is a signal

**Ground:** 2026-11-21: the Windows and 2 s test family turned `main` and PRs red (#4001 `105bc89`, #4002 `969157c`, #3945 `cdb6842`) and the gates did not play what the CI plays (#3996 `65bcec8`).

- The station's gates play what the CI plays before a delivery is pushed. #3996 delivered this for type checks and pushes.
- A test that fails and then passes on a rerun is **quarantined automatically**. It stops counting, and a fix ticket is filed once. A red always means something.

### A5. Prune the pipeline by measure

**Ground:** 2026-11-20 → 21: pass steps that fed the loops they should stop — frozen tests refused the manager's own amendment (#3910 `38022fc`, #3921 `db9b3ea`, 2026-11-21 → a frozen test green on main was a send-back reason) and a surviving-mutation relaunch loop (#3976 `cc0c2ee`, #3970 `fd4db5d`).

Each pass step (frozen tests, mutations, red-on-main proof, design review) shows what it caught and what it cost, over a month. #3515 started counting defects that escape the pass. Steps that cost more than they catch are deleted, in the spirit of #3904.

### A6. Capacity

**Ground:** 2026-11-20: a queue that did not say what each waiting ticket waited behind (#3974 `3ab6d73`) and a kitchen shown as stuck on a held zone (#3761 `0dbf1d8`).

One box with 8 cores serves five projects and stays CPU-bound for hours. Elastic stations come last in the roadmap, and that does not change here. This spec only asks that the queue says « waiting for a place » when capacity is the cause, so that it is never mistaken for an outage.

## Axis 2 — Trust

### T1. One honest logbook

**Ground:** 2026-11-21 → 22: the chef learned of outages from about 30 GitHub mails a day and a screenshot, not from a reading of the day (see the table above; #3979, #4001).

There is one place, short, per project and per day. It says what was delivered, what broke, what the system fixed by itself, and what it could not fix. It includes the system's own mistakes. It is a reading, not an alert: it replaces mails and screenshots as the source of truth. It is built from the agents' threads (C2).

### T2. Proof with every delivery

**Ground:** 2026-11-21: a frozen acceptance test already green on main was counted as a send-back reason (#3921 `db9b3ea`, `f6796e9`), so the chef could not tell from a delivery what had really been proven.

Every merged delivery shows its acceptance criteria, the test that proves each one and its result, plus a capture for a screen. The chef can trust a delivery without reading its code.

### T3. Alerts that are worth something

**Ground:** 2026-11-20 → 22: the red `main` mails from flaky tests (#3953 `fb1a0ad`, #4001 `105bc89`, 2026-11-21) and 7 TODO cards that asked the chef technical questions (#3888, #3910, #3911, #3947, #3949, #3960, #3965), all answered « close it ».

Every alert can be acted on, and silence means that all is well. The ratio of alerts the chef acts on to alerts they get is tracked. The GitHub mails stay: they are the chef's smoke detector. What has to go are the red runs behind them (A4).

### T4. An automatic post-mortem

**Ground:** 2026-11-21: the chef, not the system, saw the zone cycle of #3979 (`5df4a7e`) and the split epic's PR holding a zone (#3932 `d783752`, 2026-11-20). Nothing recorded who saw them first.

Every outage longer than 30 minutes gets a five-line note: the cause, how long it lasted, **who saw it first** (the system or the chef), and the fix ticket. The « seen first by the chef » count is read from these notes.

### T5. Predictability

**Ground:** 2026-11-19 → 22: a board that only grows durations (« 1 h », « 1 d ») led the chef to say « on a l'impression que c'est bloqué » (#3761 `0dbf1d8`, 2026-11-20).

Each ticket shows an estimate, and the actual time is compared with it. A ticket that will be late says so before it is.

### T6. Reversibility

**Ground:** 2026-11-20 → 21: the supervisor's closed set of gestures (#3944 `684d09f`, 2026-11-20) acted on the rail from the first day, with no undo, and it turned `main` green three times by itself from 2026-11-21.

Every automatic gesture is logged with its reason, and can be undone when it is reversible: reopen, rerun, revert a closer merge by a PR. The chef can pause the kitchen, or one agent, in one click.

## Axis 3 — View and control of the agents

The principle: **no autonomous agent is a black box.** For each agent, the chef sees who it is, what it is doing, why and at what cost, and can stop it or undo what it did. All of it lives **in the existing project view**, with no new screen.

What this axis gives each of the four autonomous agents:

| Agent | What the chef sees | What the chef controls |
|---|---|---|
| **Supervisor** | its wake reason, each gesture of its closed set with the evidence (C1, C2) | pause, undo a rerun or a ticket put back (C5, T6); starts on « act » |
| **Closer** | each closing pass in plain words, what it left and why (C7) | « propose »: a preview before the merge, one-click OK (C4); starts on « propose » |
| **Manager** | its rewrites, calibrations and splits in a card's history (C3) | « act » by default, except that splitting an epic is « propose » (Q2) |
| **Pass** | the steps it ran, what each caught and cost (A5, C8) | pause; starts on « act » |

### C1. The team strip

**Ground:** 2026-11-20 → 21: the supervisor (#3943 `a56fb76`, #3944 `684d09f`) started to act and the chef had no view of it; the same nights tickets were parked and nobody saw the kitchen idle for 6 h (#3911).

The top of the project view shows one badge per agent: manager, supervisor, closer, pass, and each cook. Each badge shows the agent's state (idle, working on #N, broken), its last gesture and when, and **its next run**, for example « closer: next pass in 3 h » or « supervisor: wakes if nothing is merged by 18:40 ».

### C2. An agent's thread

**Ground:** 2026-11-21: the supervisor's turn keeps skips of the previous turn (#3761 `5ce38b5`) — a state no one could read from outside.

Clicking a badge shows the agent's last gestures, one line each, with the reason and the outcome:
- « Supervisor · 17:01 · reran `tests` on 0de1ff5 (red for 10 min) → green »;
- « Closer · 03:12 · deleted 412 dead lines in `runtime/src/retenue/` → merged ».

The thread also shows the agent's « fixed by itself / handed to the chef » counter.

### C3. A card's history

**Ground:** 2026-11-20: a cook ↔ review loop of about 15 rounds in 40 min (#3955 `f8b8232`, #3959, #3961 `9364563`) that a card showing only « 1 h » could not explain.

A card opens on its timeline: claims, cook runs, review verdicts, the manager's rewrites, the supervisor's gestures. A card that shows « 1 d » or « 3rd try » finally explains why.

### C4. An autonomy level per agent

**Ground:** 2026-11-20 → 22: the manager's gestures and the supervisor's closed set (#3944 `684d09f`, #3911 `35407a8`) were all « act » from day one, and the review contradicted the manager (#3962 `c765bbf`).

Three steps for each agent:
- **observe**: it says what it would do;
- **propose**: it waits for the chef's OK, in one click;
- **act**: it does it, then says so.

For example, the supervisor on « act », and the closer on « propose » until its record earns « act ». An agent goes up a step when its thread justifies it. Trust is earned one agent at a time, with evidence.

### C5. Pause and undo

**Ground:** 2026-11-21: a delivery pushed before the gates passed and a closed PR put back in pass (#3996 `65bcec8`, #3990 `435495c`) — gestures that were wrong and could only be fixed by hand.

Each agent has its own switch, and each automatic gesture has its « undo » when it can be undone (T6).

### C6. « Why? » and « I disagree »

**Ground:** 2026-11-20: 7 TODO cards the chef closed with « close it » (#3888, #3910, #3911, #3947, #3949, #3960, #3965); the manager never learned why they were not worth a card.

Every gesture carries its evidence: the log, or the rule applied. When the chef answers « I disagree », the manager turns it into a rule or a ticket, so that the agent does not do it again.

### C7. What the closer does, in plain words

**Ground:** 2026-11-19 and 2026-11-21: the closer's passes (#3857 `46d61b3`, #3993 `e648205`) moved tests around and merged with nothing the chef could read afterwards. No outage of 2026-11-19 → 22 is recorded against the closer itself; this proposal rests on the same blindness as the supervisor's (#3911).

Each pass of the closer has a summary:
- the lines deleted and the duplicates merged;
- the drifts it measured;
- what it left, and why;
- on « propose », a preview before the merge.

### C8. What each agent costs

**Ground:** 2026-11-21 → 22: about 35 cook runs and 3.5 h on a red CI of #4001 before anyone noticed (#4006 `4dc780f`).

For each agent, per day: Max tokens, CI minutes and GitHub calls. A loop shows up through its cost, as #4001's 35 runs would have.

### C9. One channel to reach the chef

**Ground:** 2026-11-21 → 22: about 30 mails a day from red runs, and the chef's « démerde-toi pour faire repartir la cuisine » on the zone cycle (#3979 `5df4a7e`).

The logbook digest (T1) replaces mails as the way to tell the chef something. A notification is sent only when the system gives up, which is the only time it needs the chef.

## Measurement

### The key measure: outages seen by the chef first

- **An outage** is a period of 30 minutes or more when the kitchen delivers nothing it should, or when `main` is red, or when a card asks the chef something an agent could decide (the same bar as T4).
- **Seen by the chef first** when the first trace of it that reached the chef (a GitHub mail, a screenshot, a message, a TODO card) is dated before the first trace that the system itself wrote (a supervisor gesture, a logbook line, a post-mortem note, an alert).
- **How to count.** Until T4 exists, count by hand each week from the issues, the PRs and the supervisor's comments: for each outage list the two dates and keep the earlier. Once T4 exists, count the post-mortem notes whose « seen first by » says « chef ». The measure is that count per week, and its share of all outages.
- **Baseline.** 2026-11-19 → 22: nearly all of the outages in the table above (the chef or the second first). **Target: zero.**

### Success measure per axis

| Axis | Success measure | Read from |
|---|---|---|
| Autonomy | Outages that an invariant (A1) or the progress trigger (A2) caught before the chef: at least 9 in 10, over 4 weeks | post-mortem notes (T4) |
| Trust | Share of alerts the chef acts on (T3), and share of outages whose note says « seen first by: system »: 100 % over 4 weeks | the logbook (T1), post-mortem notes (T4) |
| View and control | Every gesture of the supervisor, the closer, the manager and the pass appears in its agent's thread with a reason; the chef can pause each agent; the count of questions « what did X do? » asked of the second falls to zero | the agents' threads (C2) |

These thresholds are proposals: the chef sets them by validating this spec.

## How the axes fit together

- The **logbook** (T1) is the sum of the agents' **threads** (C2).
- **Post-mortems** (T4) are attached to the agent that saw the outage, or missed it, and they feed the « seen first by the chef » count.
- **Autonomy levels** (C4) let the chef hand over control step by step. **Invariants** (A1) and **progress supervision** (A2) are what make « act » safe to grant.

## Proposed first tickets

A proposal only: **no issue is created by this spec.** Each entry becomes a `product` issue once the chef validates it. Recommended order, as the chef answered (Q1): 1, 2, 3, 4.

### 1. Check the rail's invariants on every tick, and trigger on no progress
- **Axis:** autonomy (A1, A2).
- **Outage answered:** 2026-11-21, the zone cycle of unclaimed tickets, #3979 (`5df4a7e`); 2026-11-19, a `taken` ticket with no cook, #3883 (`bb08533`).
- **Acceptance criteria:**
  - the supervisor's tick checks each invariant listed in A1 and writes one line per broken invariant, naming it;
  - a fixture rail where a ticket nobody cooks holds a file zone is repaired by the tick with no human and no new ticket;
  - a ticket with no commit, CI result, review verdict or agent label change for X minutes makes the supervisor wake and name it;
  - a healthy rail makes the tick write nothing.

### 2. Write an automatic post-mortem with « seen first by »
- **Axis:** trust (T4).
- **Outage answered:** 2026-11-20 → 21, the split epic's PR holding a zone (#3932, `d783752`) and #3979, both seen first by the chef.
- **Acceptance criteria:**
  - an outage of 30 minutes or more gets a note of five lines: cause, duration, who saw it first, the fix ticket;
  - the note's « seen first by » is read from dates, not typed by hand;
  - the weekly count of the key measure can be read from the notes;
  - an outage shorter than 30 minutes makes no note.

### 3. Show the team strip and the supervisor's and closer's threads
- **Axis:** view and control of the agents (C1, C2; C7 for the closer).
- **Outage answered:** 2026-11-20 → 21, the supervisor acting (#3944, `684d09f`) and tickets parked all night with the chef seeing nothing (#3911, `35407a8`).
- **Acceptance criteria:**
  - the top of the project view shows one badge each for the manager, the supervisor, the closer and the pass, with state, last gesture, and next run;
  - a click on the supervisor's or the closer's badge lists its last gestures, one line each with reason and outcome;
  - no new screen is added;
  - an agent that has done nothing shows « idle » and its next run, not a blank.

### 4. Write the logbook of the day from the threads
- **Axis:** trust (T1, C9).
- **Outage answered:** 2026-11-21 → 22, about 30 GitHub mails a day and the chef learning of outages by screenshot.
- **Acceptance criteria:**
  - the project view shows, live, what was delivered, what broke, what the system fixed by itself and what it could not;
  - a digest of the previous day is sent each morning (Q3);
  - a gesture of an agent's thread appears in the logbook, and the system's own mistakes too;
  - on a day with nothing to say, the digest says so in one line.

## The chef's answers (2026-11-23)

- **Q1 — the first tickets.** The order above stands: A1 + A2, then T4, then C1 + C2, then T1.
- **Q2 — autonomy levels.** The supervisor and the pass start on « act », the closer on « propose ». The manager starts on « act », except that splitting an epic is « propose ».
- **Q3 — the logbook's rhythm.** Both: live in the project view, and a morning digest of the previous day.
