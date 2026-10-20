# brigade V2 — design

**Date**: 2026-10-08
**Status**: consolidated brainstorm, to be validated before the implementation plan
**Scope**: complete overhaul — brigade goes from a Claude Code plugin to an application: a runtime
on the parade-box and a desktop app on the Mac (embedded terminal, local runner, dashboard)

---

## The problem

V1 proved the principle: a human who debates product, agents who deliver, all coordination in
durable artifacts. It runs into six limits, all of them lived:

1. **The Manager asks too much.** Approvals, merges that auto mode refuses, questions it could
   settle itself: you have to be connected all the time for it to move. And changing its
   permissions on the box is painful (settings files, session restart).
2. **The Designer is the wrong split.** The real need is not "a designer", it is: some work needs
   a human, other work needs tools that only the Mac has (connected Chrome, prod access, gcloud,
   az).
3. **One Manager, a small pool.** The Manager is a parent process that spawns teammates: limited
   pool, everything dies with it, agent teams are experimental, an interactive session is
   mandatory.
4. **Claude only.** A subagent cannot be a Codex, a Mistral or an openweight. (V2 stays on
   Claude, but lifts this architectural lock for later.)
5. **Interchangeable devs who learn nothing.** Same prompt, same model, no memory from one
   ticket to the next.
6. **A parked dev does not report itself.** Measured on 2026-10-08: two devs inert for **65
   minutes**, one with its fix **committed but never pushed** — finished work, invisible. The
   Manager found out by comparing the time and the date of the last commit, and apologized for
   it: *"I had planned to nudge after 15-20 min and I didn't"*. Quota cost: zero, hence no
   alert.

Root causes: the Manager is both **parent process** (hence 3 and 4) and **the agent that judges
everything** (hence 1 and its context cost), and the system has **no notion of capability**
(hence 2). Limit 6 adds two of the same kind: **delivery depends on a last gesture by the
agent** (pushing), and **monitoring rests on an agent's memory** — and an LLM does not hold a
timer. What depends on a last gesture will sometimes be forgotten.

## Constraints

- **Subscriptions, no API.** We use the Max account through the official `claude` CLI, not the
  API billed per token. The limiting factor becomes **the quota** (rolling windows, weekly caps
  shared among all the account's sessions), more than money.
- **Claude first.** V2 targets only Claude. Codex, Mistral and the openweights come after (see
  Parking lot); the architecture keeps the door open through the engine adapters.
- **Max terms of use** (checked on 2026-10-08, Claude Code's "Legal and compliance" doc): logging
  in with your own subscription in the unmodified official `claude` binary is allowed, including
  on a hosted machine. Forbidden: using these credentials outside Claude Code / Claude.ai (Agent
  SDK, third-party tools), or passing other people's usage through. Point of vigilance: the Max
  limits assume "ordinary, individual" usage; high, continuous parallelism moves away from it,
  and Anthropic reserves the right to act without notice. Hence:
  - the adapters drive **only the official `claude` binary**, never the extracted token;
  - **no Agent SDK** (it requires an API key);
  - the scheduler caps parallelism on the Max account;
  - in V2.5, each human logs in with **their own account**.
- **The parade-box (Kimsufi) will never have prod access.** Sensitive access (prod servers,
  gcloud, az) lives on the Mac and stays there.
- **Several projects in parallel**, as today, without stepping on each other.
- **Visibility**: know at any moment what is running, who is stuck, how it is going.

## Vocabulary

Names are in English, borrowed from kitchens. We strictly separate what reasons (agents) from
what is code (tools).

### The agents — those who reason with an LLM

| Name | Role | Engine | Replaces |
|---|---|---|---|
| **second** | The chef's counterpart: product debate, writes tickets and criteria, sets priorities, serves the questions | Claude, session in the app's terminal | PO |
| **manager** | Drives a project: splits, orders, arbitrates, reacts to failures. Its loop is code; it calls an LLM only to judge | Hybrid: code + occasional LLM | Manager |
| **cook** | Executes **one** ticket | Claude in V2 (other engines later) | Dev |
| **reviewer** | Reads the diff for the pass | Claude in V2 | Manager's review |
| **closer** | Tidies up the kitchen: measures drift, then prunes, simplifies, deduplicates. Off the rail | Claude | — (nobody) |

### The tools and the infra — code, no LLM

| Name | What it is |
|---|---|
| **rail** | A project's ticket queue |
| **ticket** | A unit of work (a GitHub issue) |
| **pass** | The step before serving: gates, CI, call to the reviewer, merge |
| **station** | Machine + engine where a cook runs, with the capabilities it provides |
| **scheduler** | Shares quotas, stations and machine load among projects |
| **All projects** | The app's global screen, all projects together. It was called "kitchen" until 2026-10-12 (#364), and the dated specs from before still say so |
| **kitchen** | The state of a project on its box (`open`, `held`, `stopped`, `off`): what the chef's `stop` stops. In the log, `kitchen.stopped` and `kitchen.resumed`. Neither a screen, nor the `taken` step of a ticket |
| **log** | The event log everything derives from |
| **grants** | The authorizations the chef gives on the fly |

### The concepts

| Name | Meaning |
|---|---|
| **chef** | The human. Sets the menu and the priorities, has the last word |
| **project** | A git repository |
| **brigade** | The team of agents working on a project |
| **cook profile** | Engine + tools + skills + notebook of lessons, plus a **default** and a **cap** of calibration. Specific to the project, defined in its repository |
| **calibration** | Model + effort of a cook. Decided **per ticket**, never frozen in the profile |
| **specialty** | A profile's domain (security, writing, DB…): a routing preference, never a constraint |
| **closing** | The moment when the kitchen is tidied up. Off the rail, triggered by measurement, never by a priority |

Reusable service jargon for statuses: **fire** (launch a ticket), **86** (no longer available:
quota exhausted, station absent), **behind** (late).

## Principles

1. **The manager no longer spawns.** It puts tickets on the rail; stations come and take them.
   No more parent process, hence no more pool limit, no more collective death, any engine.
2. **The manager is mostly code.** The loop (rail, leases, matching, retries, pass) is
   deterministic and costs no quota. An LLM is called only to judge: qualify, split, arbitrate a
   conflict.
3. **Capabilities, not roles.** A ticket declares what it **requires** (`chrome-connecté`,
   `accès-prod`, `revue-humaine`, `gpu`…), a station declares what it **provides**.
4. **One cook = one ticket.** The lesson of the permanent employee-dev still holds, and weighs
   more in quota than in euros.
5. **Durable artifacts remain the truth.** GitHub carries tickets, PRs, decisions; the runtime
   state (leases, quotas, runs, notebooks) lives in a local database. Everything is rebuilt after
   a crash.
6. **Never block on the chef.** What waits for them piles up; everything else moves on.
7. **The runtime harvests, it does not wait to be served.** A cook has no delivery gesture to
   perform — no pushing, no opening a PR, no announcing it is done. The runtime observes its
   worktree and takes what is ready. And no guardrail rests on an agent's memory: there is no
   "nudge" that someone has to remember.

## Architecture

```
┌──────────────────────── parade-box (Kimsufi) ─────────────────────────┐
│                                                                        │
│  quota arbiter ── Max account cap, project weights                    │
│      ▲                                                                 │
│      ├── brigade@A : log · rail · pass · cooks (container A)          │
│      ├── brigade@B : log · rail · pass · cooks (container B)          │
│      └── …  one runtime instance per project, updated separately     │
│                                                                        │
│  one log (SQLite) PER PROJECT — read by the runtime's commands        │
│  Engine adapter: claude -p (other engines later)                │
│                                                                        │
│  NO prod access.                                                       │
└───────────────────────────────▲────────────────────────────────────────┘
                                │ SSH, by key
                                │ (the Mac connects, never the reverse)
┌───────────────────────────────┴──────── Mac: brigade app ──────────────┐
│  One space per project:                                                │
│    · embedded terminal — the second (claude) + shells, local           │
│    · the project's rail, cooks, grants, log                            │
│  All projects: the overview                                            │
└────────────────────────────────────────────────────────────────────────┘
```

### The desktop app

**The mockup is authoritative for what is shown**: [`docs/maquettes/app/`](../../maquettes/app/) —
four screens, drawn on 2026-10-08, updated on 2026-10-12. Its `README` also says what is drawn
there **without** being the V2 target (a cook's live feed, the other engines, the Mac runner,
preprod, profiles and notebooks, any numeric quota gauge). What follows states the intent; the
mockup gives the form.

- Desktop app on the Mac — **Electron, xterm.js and node-pty**, settled at milestone 6. It
  embeds **real terminals** (like VS Code): you do not leave the app to work locally.
- **It adds nothing to the runtime.** No API, no port, no authentication layer: it launches the
  existing commands through `ssh` and **displays their output as is**. The reader's key is the
  authentication. Three intended consequences: **a single rendering** of a given fact, **no
  button that duplicates a terminal gesture**, and **no deduction** — what it shows, it obtained.
- **The terminal remains the default usage** (chef's decision, 2026-10-11). The app never
  becomes a mandatory passage: broken, the kitchen is driven as before. What it removes is not
  the terminal, it is having to open one elsewhere and reconnect to it by hand.
- **One space per project**, chosen in a sidebar (Slack/Discord style). A space has its tabs:
  Second (the terminal), Rail, Cooks, Grants, Log.
- **All projects**: the global screen at the head of the bar, a shared view of all projects.
- **It talks to a heterogeneous fleet permanently**, not only during an update: project runtimes
  are updated one by one. A project presents itself in **one of three states that do not look
  alike**: drivable, reachable but no longer drivable (with the gesture that brings it up to
  date), or unreachable. It never assumes that all projects answer alike. **It does not read a
  version number**: it learns by trying, and reports what it obtained — a number would be an
  intermediary to a fact it holds directly.
- A read-only web access to the dashboard (phone) remains possible on the box side.

### The second

- A **real Claude Code session** launched by the app in the embedded terminal, in the project's
  folder: we keep everything (`!`, slash commands, history) without rebuilding a chat.
- The `!` run **on the Mac**, with the chef's prod access.
- Light brigade plugin. Writing and editing epics and tickets, setting priorities, reading the
  state, answering questions, giving or removing grants: **all of this already exists** through
  `gh` and the runtime's commands (`status`, `rail`, `grant`). **MCP is not part of V2**: it
  would re-expose as tools what is already there, with its transport and its authentication. Its
  only reason to exist is access for other humans — hence V2.5 (§Parking lot).
- **On opening**, a hook serves the queue: pending questions, deliveries, what is in preprod to
  accept, alerts.
- App closed: nothing is lost, questions pile up on the runtime side.
- Planned for V2.5: access for other humans (partners, clients), and that is where MCP and its
  authentication make sense.

### The manager

- One per project. A runtime process, woken by an event (GitHub webhook, end of ticket, cook
  signal, periodic tick), with no in-memory state.
- Splits epics into tickets with **dependencies** (B awaits A), partitions by file zone (V1 rule
  kept: one file, one owner among concurrent tickets).
- Orders **within** the product priorities set by the second. Can prioritize on its own what
  arrives along the way (bugs, out-of-scope) according to the charter.
- Reacts to failures: re-splits, changes cook profile, escalates to the second.
- Per-project lock: never two managers on the same repository. As many managers as projects.

#### The lease is renewed by proof of work

A taken ticket is held by a **lease**, and this lease is renewed **only** on proof of work
observable from the outside: a commit, a file touched in the worktree. Never on the cook's
presence, nor on what it says it is doing.

This is a **longer scale** than the idle guardrail (§Guardrails), which watches liveness on the
output stream. The two coexist: a cook can be very much alive and not progressing, and then the
lease decides, not the idleness.

Intended consequence: **the "alive but parked" state does not exist.** An inert cook loses its
ticket exactly like a dead cook, without anyone having to notice or relaunch it.

And before returning a ticket to the rail, the runtime **harvests what exists**: if the worktree
holds complete work, it goes into pass instead of being thrown away. A cook that committed then
stopped is treated as a cook that finished, not as a failed cook. Work done must never be lost
because nobody claimed it (limit 6).

### Stations and cooks

A **station** = machine + engine adapter + capabilities. Examples:

| Station | Provides |
|---|---|
| `box/claude` | code, reasoning — the **calibration** is set per ticket, not per station |
| `box/playwright` | headless browser (covers most "browser" needs) |
| `mac/claude-chrome` | `chrome-connecté` |
| `mac/accès-prod` | `accès-prod` — always with the chef's validation |
| `chef` | `revue-humaine`, decisions |

A **cook profile** = engine, model, tools, skills, and a **notebook** of lessons. The evals serve
as a non-regression guardrail for the profiles.

#### Profiles are specific to the project

A "security expert" profile does not mean the same on an infra project and on a showcase site; a
"writer" profile means nothing on an infra project. V2 therefore ships **no catalogue of
profiles**: it ships the ability to make them, and they belong to the project.

Their **definition** (engine, model, skills, scope) lives **in the repository**, versioned: it is
configuration that is re-read and travels with the project — V1 already does exactly that with
its roles in markdown. Only the notebook mutates at each ticket (see below).

**By default, no profile.** A ticket can load skills ad hoc ("use the copywriting skill") without
any profile existing: it costs nothing to build and covers the majority of needs. A profile adds
only two things — the **capitalization** of a notebook and the **measurement** over time — and it
is only worth it if it has the ticket volume to fill them. Below that volume, a profile is just a
generalist with skills, and we might as well own it: fifteen profiles that have each seen two
tickets give fifteen empty notebooks and a meaningless measurement.

#### Specialty is not capability

The two look alike and do not behave alike:

| | Nature | Effect on matching |
|---|---|---|
| **capability** (`chrome-connecté`, `accès-prod`, `gpu`) | hard, binary, verifiable | **filter**: without it, the ticket is impossible |
| **specialty** (security, writing, DB) | soft, graded, not verifiable | **preference**: a generalist remains capable |

Confusing them would build a bottleneck: a ticket `requires: security` would wait for "the expert
to be free" whereas a profile is not a scarce resource — you instantiate as many as you want, it
is only configuration. What is scarce is the **quota**, the **parallelism cap** and the
**partition by file zone**.

The cost of a specialist is therefore not a wait but a price: it will often want a more expensive
model and more turns (reading the surrounding code, checking dependencies). The real trade-off is
"one security ticket on Opus, or three ordinary tickets on Sonnet?", and it is set by a **budget
or a weight per domain** on the scheduler side — not by a waiting time.

#### Calibration is decided per ticket, not per profile or per station

The **model** and the **effort** are neither a property of the machine, nor a durable property of
the domain. A model is an invocation parameter of the same `claude` binary on the same machine:
making it a station dimension would multiply stations for nothing (three models × two machines =
six stations for a single real capability). Hence a single `box/claude` station.

V1 nevertheless makes calibration a datum of the profile, and rightly so within its frame: it
exposes the same dev under three calibrations carried by each agent's frontmatter, and "choosing
the agent is settling the effort". It holds because it has only one domain, the generic dev. As
soon as you add security, writing, DB, the same choice gives a **cartesian product** — three
domains × three calibrations = nine profiles, seven of them with an empty notebook. That is
precisely the flaw described above.

The two axes are therefore separated:

| Axis | What it carries | Lifetime |
|---|---|---|
| **profile** | skills, notebook, domain scope | durable, versioned in the repository |
| **calibration** | model + effort | decided at each ticket |

And the decision follows the same pattern as specialty — **the profile asks, the scheduler
disposes**:

- the **profile** carries a **default** and a **cap** (a security profile does not go below
  `medium`; a formatting profile does not go above `low`);
- the **ticket** carries the value, decided by the manager on its ticket type → calibration table
  — that is already its job in V1;
- the **scheduler** arbitrates under quota constraint: it can degrade or make wait, never exceed
  the profile's cap;
- the **chef** caps by domain budget.

**The default is a cap, not a starting point.** Measured in V1: *32 teammates spawned in a row,
31 at `effort: high`* for lack of a decision at spawn, whereas reasoning tokens are billed as
output. In V2 this bias would be worse, not better — the manager is code, it launches unattended,
and no human sees the bill go by anymore. Hence two requirements: **no cook is launched without
an explicit calibration** (guardrail, see below), and the **log carries each cook's
calibration** — the V2 equivalent of V1's "the human must see what they pay".

#### The notebook has two tiers

After each ticket, a short retro proposes lessons. They wait for nobody:

| | Where | When it applies | Who validates |
|---|---|---|---|
| **provisional lesson** | the runtime's database | immediately | nobody |
| **promoted lesson** | notebook versioned in the repository | at promotion | the pass, under grant |

The next cook benefits immediately from the provisional lessons. The repository, for its part,
receives only what has proven itself and stays readable.

**Promotion criterion: repetition across independent retros.** If several cooks, on different
tickets and without seeing each other, propose the same lesson, it is true. It is measurable
without instrumenting anything — you only have to compare retros, whereas "was this lesson
applied?" cannot be measured. Happy consequence: **the more you parallelize, the more reliable
the promotion**, whereas concurrent retros first looked like a flaw. The threshold — how many
concordant retros — is arbitrary at the start and is tuned by measurement.

That removes a chore along the way: sorting the notebook is no longer a manager gesture, it is
the promotion that filters. A notebook no longer grows without sorting.

And the chef is never on the critical path: the promotion PR is merged by the pass under grant,
like any delivery. They review **after the fact** — the notebook's `git log` says when each
lesson entered and on which retros — and remove a lesson through a PR, like any revert. A pending
promotion never blocks a deployment; the reverse would be worse, because a notebook that waits is
a notebook that serves no purpose.

In V2, a single adapter: `claude`. An **engine adapter** knows how to: launch the CLI headless
with the right config, read its stream (streamed JSON), detect the end, the failure, and quota
exhaustion.

### The pass

- A runtime tool, no longer the manager's work: the project's gates (`gates.sh`, V1 contract
  kept), reading the CI, call to the **reviewer** framed on the diff. The reviewer goes **after
  green gates**, and one of its **blocking** findings turns the pass red, gates green or not.
- Green → automatic merge if the `merge` grant is active. Red → findings sent back to the cook,
  **two send-backs max** (V1 rule), then follow-up issue or escalation.
- The **two send-backs are not two identical attempts**: the first fixes at the same calibration,
  the second **goes up** (model or effort) within the profile's cap. And a cook that discovers
  along the way that its ticket exceeds its calibration **hands back asking for the step up**,
  rather than failing or delivering badly — which V1 does not allow, its effort being frozen in
  the agent's frontmatter.
- A batch of tickets on disjoint zones is merged in one block (V1 rule).
- After merge: the project's CI deploys to preprod; the second summarizes what is to be
  accepted. Nothing blocks on acceptance.
- **Every cook comments on its ticket** at the end of its run, whether it produced code or not.
  The report becomes a durable artifact on GitHub, readable without opening the app — and that is
  where the second reads what there is to accept.

#### Tickets with no diff

Some tickets produce no diff: an audit, a comparison of approaches, an analysis ("why is the CI
slow?"), or the deliverable of a non-code cook. A non-code cook is not a special case of the
model — it is a cook whose diff is empty.

- Gates and CI are **silent** on this kind of deliverable, and there is nothing to merge. Such a
  ticket is **served as soon as its deliverable has been reviewed**: its verdict is the
  reviewer's, and the reviewer's alone (principle 6: nothing waits for the chef; acceptance
  remains informal, as in V1). Nothing to merge, hence no grant to consult.
- On code, the gates catch the worst even without review; here, nothing would catch it. A cook
  that goes off the rails would produce a false report marked "served", and nobody would know
  before reading it.
- Hence: **the reviewer is mandatory on a ticket with no diff** — it is the only judge available
  —, whereas it **complements** the gates on code. A non-code deliverable never goes to "served"
  without having been reviewed (decision of 2026-10-08, PR #44, delivered by #72).
- That makes feasible a class of tickets the model did not know how to finish: audits, analyses,
  recommendations.

## Grants, and no charter alongside

This is the piece that settles problem no. 1.

**Decided on 2026-10-10 by the chef: the charter is empty at the start — and it is not one more
object.** A line only makes sense where an action is **irreversible or leaves the repository**:
merging, pushing, publishing, closing, spending. Everything reversible — splitting, ordering,
calibrating, launching, relaunching — is not an authorization: it is what the brigade *is*. You
do not ask permission to exist.

What remains is a list of irreversible actions, off at the start, each lifted by a grant. **It is
the list of grants itself**: nothing to read alongside. What no grant lifts is read in the same
place.

Grants are runtime objects, not files:

- Given in one sentence to the second: "you can merge from now on", "authorize `gh release` on
  thermigo until Friday".
- One action, and an expiry: permanent, until a date, or N uses. **No "all projects" scope**: a
  grant is a fact in the log, and there is one log per project.
- **Immediate effect**: the pass and the manager consult the grants at each decision; each cook
  is launched with settings **generated** from the grants of the moment. Nothing to edit, nothing
  to restart.
- Visible and revocable in the app. Each use is logged.
- Hard cap: no grant can give `accès-prod` to a station of the box, nor lift the rule that
  forbids the runtime from reading the Max account's credentials.

## Scheduler, quota and engines

The word "scheduler" covers two responsibilities that must be separated, because they do not have
the same scope (see §Updates):

| | Scope | What it decides |
|---|---|---|
| **quota arbiter** | **global, single** | the account's parallelism cap, weights between projects, window and reset |
| **project runtime** | one instance per project | rail, leases, the ticket's calibration, pass, guardrails |

- The arbiter knows, per account: estimated consumption (from the cooks' JSON streams), the
  current window, the next reset. And per machine: available CPU/RAM.
- It **arbitrates the calibration** requested by the ticket under quota constraint: it can
  degrade (Sonnet instead of Opus, lower effort) or make wait, never exceed the profile's cap.
- It arbitrates **specialties** by a budget or a weight per domain — "one security ticket on Opus
  against three ordinary tickets on Sonnet" — never by a waiting queue: a profile is not a scarce
  resource.
- It caps the number of simultaneous cooks on the Max account.
- "Quota exhausted" is a normal state (**86**): the ticket goes back on the rail, the brigade
  slows down.
- **Arbiter unreachable: the project launches anyway** (chef's decision, 2026-10-08). Freezing
  all projects because the arbiter went down would be the system's costliest outage, and it is
  avoidable: consumption being logged per project, the arbiter **rebuilds itself** from the logs
  on its return (principle 5). The degraded mode must be more cautious than the normal mode,
  hence its bounds:
  - a runtime without an arbiter launches **at most one cook at a time**, whatever the state of
    its rail;
  - each unarbitrated launch is logged as such;
  - the interface flags the projects running in degraded mode;
  - on return, the arbiter catches up its accounting from the logs **before** reopening the
    floodgates.
- Weights between projects are adjustable ("thermigo prioritized this week").
- Pure code, no LLM.

## Guardrails

Runtime mechanics, not agent judgment:

- Cap per ticket: turns, duration, tokens.
- **No cook launched without an explicit calibration**: a ticket without a calibration is
  refused, not launched at maximum.
- Loop and idleness detection, on **two signals at two scales** — complementary and not
  substitutable:
  - the **output stream** says the cook is **alive**. Short threshold: a cook that writes nothing
    anymore is stuck or dead. That is what the idle guardrail measures.
  - the **worktree** says the cook is **progressing**. Long threshold, carried by the lease
    (§The manager): a cook can chatter without advancing.

  Neither suffices alone: watching only the worktree would kill a cook that reads code at length
  before writing a line; watching only the stream would let through a cook that reasons in a
  loop. One measures life, the other progress.
- **Lease age without progress**, capped separately from the budgets. A parked cook consumes
  neither turn, nor token, nor run time: no budget cap catches it, only wall time betrays it
  (limit 6).
- Breaker per project after N failures in a row.
- Global and per-project **"stop" button**. It stops the kitchen, not the app, and it says which
  one: that of this project, or that of all.

## Monitoring

Everything goes through the **log**: ticket taken, cook launched **and its calibration**, signal,
question asked, pass green/red, calibration step-up at send-back, merge, quota exhausted, grant
given/used. Everything else derives from it.

- **All projects**: each project, pending questions, quota and machine gauges, live log.
- **Project space**: rail by state, active cooks, questions, grants.
- **A cook's live feed**: its stream relayed, its budget, its ticket, its profile, its
  calibration.
- Automatic **"who is stuck" detection**: idleness, too many turns, second send-back, blocking
  quota → alert in the app and to the second.
- For each taken ticket, the "All projects" screen shows **how long it has not progressed**, not
  only since when it was taken: of the two durations, it is the only one that reveals a block. It
  is read, never deduced — nobody should compare a current time to a commit's date to know
  whether it is moving.
- The second answers "how is it going on X?" by reading the same log.

## The closing

In a kitchen, the **closing** is a trade ritual: you clean, throw out what is expired, tidy up,
prepare the next service. Nobody puts it on the menu; it happens.

### The problem it solves

The chef's observation on projects run in V1: **they drift.** Devs take more and more time, the
manager too, and nobody tries to prevent it. It is not a lapse of attention, it is a consequence
of the design: **nothing, in V2, removes anything.**

| What grows | Who prunes it today |
|---|---|
| the docs | nobody — the rule says "every delivery updates the docs": it adds |
| the tests | nobody — measured on 2026-10-08: 203 → 622 tests in a single milestone |
| the code | nobody: no refactor without a ticket, and out-of-scope becomes an issue |
| the notebooks | promotion filters the entry; nothing removes a lesson that has become false |
| `CLAUDE.md` and the conventions | nobody |
| security debt | nobody, and the gates do not see it |

Three causes, all structural:

1. **one cook = one ticket** — it cannot notice in passing that three functions do the same
   thing, and if it does notice, the rule makes it an issue, not a commit;
2. **the manager orders *within* the second's priorities** — it does not create background work,
   and the second prioritizes product value: **entropy is never product value, so it never
   rises**;
3. **the gates check non-regression, not non-drift** — they say "it works", never "it is getting
   heavy".

### The closer is off the rail

**Chef's decision (2026-10-09): the closing does not follow the priority rules.** A tidying
ticket put at `prio:3` would never pass — there will always be something more useful, and that is
precisely what produces drift in V1. **Entropy does not need a priority, it needs a budget.**

The **closer** is therefore not a cook and takes no ticket: it works off the rail, in parallel
with the cooks or when service calms down.

But it keeps **all the guardrails**: caps per pass, idleness detection, "stop", breaker, and the
**file zones in both directions** — it does not touch what a cook holds, and while it tidies it
holds a lot. Leaving the rail does not mean leaving the guardrails, and for a precise reason:
**it is the most dangerous agent in the system.** A cook that errs adds bad code, and the pass
catches it; a closer that errs **erases good code**, and the gates will say "it still works" —
since what disappeared was tested by nothing.

### Observing and writing are not done in the same window

| | What it does | Non-blocking? |
|---|---|---|
| **observing closing** | measures, counts, spots duplicates and dead code, notes the drift | **yes**: it touches nothing, it can run continuously |
| **writing closing** | deletes, simplifies, tidies, deduplicates | **no**: it must merge, so it moves the integration branch under the cooks in flight |

A pass that writes while thirty cooks work is the meeting of two deliveries (§The pass)
multiplied by thirty — and it is the closer that triggers the collision. "When it calms down" is
therefore not a scheduling preference but an **execution condition**, measurable: the rail is
empty, or the number of cooks in flight is under a threshold.

### It is triggered by measurement, not by the clock

A nightly sweep is arbitrary: it runs when nothing justifies it, and after the outage when
something did. The triggers are **counters**, and the log already carries them:

- N merges since the last closing — "eighty merges in a row is a lot";
- the test suite exceeded the cap declared by the project;
- the docs grew by X% without a single file being deleted;
- N merges since the last security look — a domain where the gates see nothing.

### Its KPIs, and what stops them from cheating

**A reduction is never measured without measuring what it must not break.** An agent measured on
the number of tests will delete tests; on the size of the repository, useful code; on the gates'
time, checks. Each of these cheats improves the KPI and degrades the project.

| KPI | Nature | Its guardrail |
|---|---|---|
| number and duration of tests | symptom | coverage does not drop |
| average gates time | symptom | the gates still check as many things |
| a cook's time to deliver | symptom | normalized by ticket size — otherwise a big ticket looks like drift |
| size of the loaded context (`CLAUDE.md`, docs read) | symptom | — |
| size of the repository | symptom | the product still works |
| duplicates and dead code removed | **effect** | nothing alive has disappeared |

The **symptoms** trigger, the **effects** take stock. And the symptoms can be measured **today,
without a closer**: the log carries each cook's turns, tokens and duration, the gates know their
time, the repository is measured with `git`. **The table of these measures therefore comes before
the closer** — without it, it would tidy blindly and nobody would know whether it helps.

The most delicate case is the **cook's time to deliver**: the closest to the drift as lived, and
the most misleading. It mixes the size of the tickets, the heaviness of the project and the
clutter of the context. Better to track the **share of time spent in the gates** and the **number
of turns for a ticket of comparable size** than the raw total.

### Memory goes stale too

Notebooks have an entry — promotion by repetition across independent retros (§Stations and cooks)
— and had no exit. A lesson that has become false is worse than no lesson: a notebook that says
"always do X" when X has been replaced harms every cook that loads it.

**Promotion by repetition, expiry by silence**: a lesson that no retro has reconfirmed in N
tickets falls back to provisional, then disappears.

And for the project's memory — `CLAUDE.md`, docs, conventions — the argument is not hygiene but
economy: **it is paid at every cook.** What is loaded in every session costs context forever; a
stale convention is a permanent tax.

### What gets tidied without waiting for the closing

Not everything needs a pass. Cleaning up resources has a **natural moment** — the end of a cook,
a merge — and doing it there beats a sweep: at thirty cooks the disk fills within the day, and a
night broom comes after the outage.

| Object | When it goes | Why |
|---|---|---|
| **worktree** | at the end of the cook, success or failure | after **committing what is left lying around** on its branch: nothing is lost, and it is the worktree that weighs, not the branch |
| **branch** | at merge; otherwise after N days if abandoned | light, and it is what carries the trace |
| **raw stream** (`runs/*.jsonl`) | compressed, then purged after a delay | the big volume, and detail: the log keeps the report |
| **log** (`log.db`) | never | it is the truth, everything derives from it |

Chef's decision (2026-10-09): **nobody goes back into a failure's worktree.** It can therefore go
right away, provided the uncommitted work in it is committed first.

On top of this comes a **disk bound** that depends on no clock: past a threshold, the oldest go
now.

## Isolation and secrets

- **One container per project, one worktree per cook** (as today).
- Container network on an allowlist: Anthropic, GitHub, package registries.
- **Max account**: connection over SSH on the box (as today), credentials mounted read-only in
  the containers. The app flags an expired connection.
- **GitHub**: one GitHub App per repository, short tokens limited to the repository. Cooks push
  branches, do not merge (branch protection); only the pass merges.
- **Dev secrets**: one file per project, mounted only in its container. Never prod.

## Migration

- GitHub conventions (labels, issues, PRs, `gates.sh`, `worktree-setup.sh`) kept as far as
  possible to switch over project by project.
- Build V2 with V1.

## Updates

Brigade maintains itself with brigade: updates will be frequent, especially at the start. None
must cost a session, nor time on the other projects. The essentials are already in place — the
runtime has no in-memory state, cooks are disposable, and everything derives from an append-only
log.

### One runtime instance per project

The runtime delivered by #13 is **per project**: templated systemd unit
`brigade@<project>.service`, one state directory, one lock and one log per project.
`systemctl restart brigade@espace` does not touch `brigade@brigade`.

- **The update is done project by project**: it is operations, there is nothing to build.
- **Brigade is its own canary**: `brigade@brigade` is switched first and the other projects stay
  on the previous version while it runs. If it breaks, we lose the tool that builds brigade — not
  the other projects.
- **No more single point of failure**: a runtime that crashes costs only one project.
- Container isolation is already paid for: a single runtime would have to cross N isolation
  boundaries to drive its cooks, a runtime per project has nothing to cross.

### The rules that make a restart painless

- **A cook survives its runtime's restart.** It is detached, never a child process that an update
  would kill. Principle 7 catches it: on waking, the runtime observes the worktree and harvests
  what is ready, without depending on a message from the cook.
- **The log is an API between versions.** Append-only, it is not migrated: it is re-read. Each
  version must know how to read all past events.
- **Version contract between the interface and the runtimes**: **N and N-1 drivable**, beyond
  that visible but not drivable (see §The desktop app).
- **A "drain" mode, gentle sibling of "stop"**: stop *firing* new tickets and let the cooks in
  flight finish. A few minutes less throughput, zero loss. The stop remains the immediate halt.
- **Automatic rollback**: a version that does not start, or fails its startup checks, goes back
  by itself to the previous one. `brigade@.service` already carries half of it —
  `RestartPreventExitStatus=2` prevents a refusal to start from looping.

### The snake that bites its tail

A cook modifies the runtime that executes it, the pass merges under grant, the runtime restarts
on a broken version — and what would allow repairing no longer runs. Two guardrails:

- **the gates are not enough**: a runtime can pass its tests and refuse to start on the box. The
  check that counts is a real start;
- **deploy alongside, switch after a successful start**, and go back by itself on failure.

Per-project partitioning contains the rest: only the `brigade@brigade` instance switches.

### What still costs a session

The **second** is a Claude Code session: its prompt is loaded at startup, and a plugin update
changes nothing for a session in progress — V1 limit, unchanged. Hence a permanent arbitration
rule: **minimum in the prompt, maximum in the runtime.** A behavior placed in a role's markdown
will require a session restart; placed on the runtime side, it will not.

## Parking lot

- **Other engines** (Codex via ChatGPT subscription, Mistral, openweights via opencode/ollama).
  ChatGPT terms of use for `codex exec` to be checked when the time comes. A reviewer from an
  engine other than the cook's will then become possible.
- **Cook learning by measurement** (send-back rate, quota per ticket, duration per profile →
  routing and notebooks driven by data). Potentially the real differentiator in the medium term;
  deserves its own brainstorm.
- **Profile creation proposed by measurement**: "seven of the last twelve tickets touched the DB,
  four were sent back twice — a DB profile?". The chef does not know in advance which profiles
  their project deserves, and that is precisely what measurement can tell them. Direct extension
  of the point above.
- **Multi-human access to the second**: V2.5 — with **MCP** and its authentication layer.
- **The Mac runner**: the station that would provide `chrome-connecté`, `accès-prod`,
  `revue-humaine`. Taken out of milestone 6: no ticket asks for it. It will come with the first
  one that does.
- **A cook's live feed**: relaying its stream. The log already says who is stuck and the
  guardrails stop it — it would be a second reader of the same fact.
- Fine-grained **machine resources** (beyond a cap on simultaneous cooks): later.
- **Messaging** (Telegram, Slack) for the second: not in the immediate term.

## Open questions

1. ~~Runtime stack (language, event queue, deployment on the box)~~ — **resolved on
   2026-10-08**: see [`2026-10-08-runtime-stack.md`](2026-10-08-runtime-stack.md).
   ~~**Still open**: the app's stack~~ — **resolved at milestone 6**: Electron, xterm.js,
   node-pty. Tauri would have added Rust, hence a second toolchain and a second set of gates, for
   an interface that is TypeScript either way.
2. ~~Exact format of the ticket (in the GitHub issue body? frontmatter? capability labels?)~~
   — **resolved on 2026-10-08** (#68): a **card in a comment** on the issue, neither in the body
   nor in labels. See [`2026-10-08-fiche-du-ticket.md`](2026-10-08-fiche-du-ticket.md), and
   "La fiche d'un ticket" in [`docs/runtime/station.md`](../../runtime/station.md#la-fiche-dun-ticket).
   **Left for milestone 4**: the required capabilities, the domain and the budget, which are
   added to it as extra lines.
3. ~~How the Mac runner materializes the chef's validation for `accès-prod`~~ — **moot while the
   runner is in the parking lot.** Will come back with it.
4. ~~A cook's live feed: raw stream or live summary?~~ — **moot**: in the parking lot, for the
   same reason.
5. **How a machine reaches a box, and how one is added.** A VPN cannot be assumed: on a managed
   workstation, network extensions are forbidden. And on a box whose team accounts are locked
   into a session by `ForceCommand`, **the account that gives a human a shell is not the one that
   can launch a command for the app**. The two accesses are given separately.
