# Autonomy, trust, control — the three axes after the supervisor

Date: 2026-11-23 · Epic: #4019 · Status: **proposal, awaiting the chef's validation**

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

Write down a short list of invariants of the rail and check them on every tick. When one breaks, the supervisor repairs it with its existing closed set of gestures. A new kind of bug becomes a new invariant, not a new mechanism. Each one is a sentence, a check and a repair:

- a ticket that no cook is cooking and that is not in pass holds no file zone and reserves none;
- the same failure on the same commit is never judged or relaunched twice;
- a `taken` ticket shows progress (a commit, a CI change, a review) within N minutes;
- a ticket set aside, parked or in WAITING has a named reason and a date to look at it again: nothing is parked « until someone remembers »;
- a red check on `main` is rerun once before anything else.

### A2. Supervise progress, not states

The supervisor already wakes on « nothing merged for 30 min », « taken 3 times » and « `main` red for 10 min ». Add one generic trigger that covers the outages nobody foresaw: **no progress on a ticket for X minutes, whatever its state**. Progress means a new commit, a CI result, a review verdict or a label change made by an agent.

### A3. Never relaunch blind

Every relaunch carries the evidence of the failure: the failing check, its step and its log lines, or the review's blocking points. The same input with the same failure is not relaunched; it goes to the supervisor. #4006 to #4008 started this for red CI. The rule is general.

### A4. The CI is a signal

- The station's gates play what the CI plays before a delivery is pushed. #3996 delivered this for type checks and pushes.
- A test that fails and then passes on a rerun is **quarantined automatically**. It stops counting, and a fix ticket is filed once. A red always means something.

### A5. Prune the pipeline by measure

Each pass step (frozen tests, mutations, red-on-main proof, design review) shows what it caught and what it cost, over a month. #3515 started counting defects that escape the pass. Steps that cost more than they catch are deleted, in the spirit of #3904.

### A6. Capacity

One box with 8 cores serves five projects and stays CPU-bound for hours. Elastic stations come last in the roadmap, and that does not change here. This spec only asks that the queue says « waiting for a place » when capacity is the cause, so that it is never mistaken for an outage.

## Axis 2 — Trust

### T1. One honest logbook

There is one place, short, per project and per day. It says what was delivered, what broke, what the system fixed by itself, and what it could not fix. It includes the system's own mistakes. It is a reading, not an alert: it replaces mails and screenshots as the source of truth. It is built from the agents' threads (C2).

### T2. Proof with every delivery

Every merged delivery shows its acceptance criteria, the test that proves each one and its result, plus a capture for a screen. The chef can trust a delivery without reading its code.

### T3. Alerts that are worth something

Every alert can be acted on, and silence means that all is well. The ratio of alerts the chef acts on to alerts they get is tracked. The GitHub mails stay: they are the chef's smoke detector. What has to go are the red runs behind them (A4).

### T4. An automatic post-mortem

Every outage longer than 30 minutes gets a five-line note: the cause, how long it lasted, **who saw it first** (the system or the chef), and the fix ticket. The « seen first by the chef » count is read from these notes.

### T5. Predictability

Each ticket shows an estimate, and the actual time is compared with it. A ticket that will be late says so before it is.

### T6. Reversibility

Every automatic gesture is logged with its reason, and can be undone when it is reversible: reopen, rerun, revert a closer merge by a PR. The chef can pause the kitchen, or one agent, in one click.

## Axis 3 — View and control of the agents

The principle: **no autonomous agent is a black box.** For each agent, the chef sees who it is, what it is doing, why and at what cost, and can stop it or undo what it did. All of it lives **in the existing project view**, with no new screen.

### C1. The team strip

The top of the project view shows one badge per agent: manager, supervisor, closer, pass, and each cook. Each badge shows the agent's state (idle, working on #N, broken), its last gesture and when, and **its next run**, for example « closer: next pass in 3 h » or « supervisor: wakes if nothing is merged by 18:40 ».

### C2. An agent's thread

Clicking a badge shows the agent's last gestures, one line each, with the reason and the outcome:
- « Supervisor · 17:01 · reran `tests` on 0de1ff5 (red for 10 min) → green »;
- « Closer · 03:12 · deleted 412 dead lines in `runtime/src/retenue/` → merged ».

The thread also shows the agent's « fixed by itself / handed to the chef » counter.

### C3. A card's history

A card opens on its timeline: claims, cook runs, review verdicts, the manager's rewrites, the supervisor's gestures. A card that shows « 1 d » or « 3rd try » finally explains why.

### C4. An autonomy level per agent

Three steps for each agent:
- **observe**: it says what it would do;
- **propose**: it waits for the chef's OK, in one click;
- **act**: it does it, then says so.

For example, the supervisor on « act », and the closer on « propose » until its record earns « act ». An agent goes up a step when its thread justifies it. Trust is earned one agent at a time, with evidence.

### C5. Pause and undo

Each agent has its own switch, and each automatic gesture has its « undo » when it can be undone (T6).

### C6. « Why? » and « I disagree »

Every gesture carries its evidence: the log, or the rule applied. When the chef answers « I disagree », the manager turns it into a rule or a ticket, so that the agent does not do it again.

### C7. What the closer does, in plain words

Each pass of the closer has a summary:
- the lines deleted and the duplicates merged;
- the drifts it measured;
- what it left, and why;
- on « propose », a preview before the merge.

### C8. What each agent costs

For each agent, per day: Max tokens, CI minutes and GitHub calls. A loop shows up through its cost, as #4001's 35 runs would have.

### C9. One channel to reach the chef

The logbook digest (T1) replaces mails as the way to tell the chef something. A notification is sent only when the system gives up, which is the only time it needs the chef.

## How the axes fit together

- The **logbook** (T1) is the sum of the agents' **threads** (C2).
- **Post-mortems** (T4) are attached to the agent that saw the outage, or missed it, and they feed the « seen first by the chef » count.
- **Autonomy levels** (C4) let the chef hand over control step by step. **Invariants** (A1) and **progress supervision** (A2) are what make « act » safe to grant.

## Proposed first tickets

Recommended, in this order:
1. **A1 + A2**: the rail's invariants, checked on every tick, and the « no progress for X minutes » trigger. Together they remove the class of outages listed above.
2. **T4**: the automatic post-mortem with « seen first by », which makes the measure of this spec exist.
3. **C1 + C2**: the team strip and an agent's thread, for the supervisor and the closer first.
4. **T1**: the logbook, built from those threads.

Each one becomes a `product` issue with observable criteria, filed once this spec is validated.

## Questions for the chef

- **Q1 — the first tickets.** Is the order above right, or should the view of the agents (C1, C2) come first, because trust is the more urgent of the two?
- **Q2 — autonomy levels.** Which agent starts at which step? Recommendation: the supervisor and the pass on « act », the closer on « propose », the manager on « act » except for splitting an epic, which is « propose ».
- **Q3 — the logbook's rhythm.** Live in the project view only, or also a morning digest of the previous day?
