# The arbiter between projects (#178)

Milestone 7 of epic #179. Parent spec: `2026-10-08-brigade-v2-design.md`, §Scheduler and §Updates.
Product decisions settled by the Manager on 2026-10-09, recorded on the issue.

## The problem

As soon as a second project runs on the machine, two resources are shared and neither is
arbitrated: the **Max account** (each project has its cap on cooks, nothing adds them up) and the
**machine** (a project that launches everything it can starves the other). Each runtime sees only
its own rail.

## What is delivered

An **arbiter**, one per machine, above the project runtimes. It decides nothing about the work: it
answers a single question — "can this project launch one more cook?" — taking all projects into
account. Code, no LLM.

| Criterion of the issue | Where |
|---|---|
| A single arbiter, consulted before every launch | `arbitre.ts` (the process), `arbitrage.ts` (what the station asks it), `station.ts` |
| Weights between projects, without touching each one's caps | `run arbiter -- weight <project> <n>` |
| A project does not starve the others | the sharing rule, below |
| Arbiter unreachable: at most one cook, logged and flagged | `station.unarbitrated`, marked `cook.launched`, `status`, `journalctl` |
| It does not claim to know the account's consumption | "cook consumption", totaled from what the runtimes say |
| Readable: per project, what is running and what is still allowed | `run arbiter` |

## What the arbiter knows, and from where

**Nothing it counts is its own.** Each runtime **restates** its state at every exchange: its
ticket cooks in flight, whether it has queued tickets, whether it is withholding because the
machine is saturated, and what its cooks have consumed. The arbiter keeps each one's last word in
memory, never on disk: an arbiter that restarts starts empty and fills up with what it is told
again.

What it keeps on disk (`arbitre.db`, in `BRIGADE_ARBITER_STATE_DIR`) belongs to the **settings**:
the known projects, their weight, and those that left cleanly. That is where the chef's command
writes; the arbiter rereads it at every decision, nothing needs restarting.

A runtime speaks: at every launch request, at every pass of its station whose state has changed
(a cook ending, a withholding), at every tick (this is what fills a returned arbiter), and at its
clean stop (it hands back its share).

## The sharing rule

`P`: the account cap, set by the chef (`BRIGADE_ARBITER_MAX_COOKS`, **no default**).
`T`: the cooks in flight, all projects heard. A project is **active** if it has cooks, demand, or
if it is known and has not spoken again.

- **Share.** Each active project receives `max(1, ⌊E × weight / sum of the active weights⌋)`,
  where `E` is the effective cap. Never less than one slot.
- **Normal running** (`E = P`). A project under its share passes, as long as `T < P`. Beyond its
  share, it **borrows**: it passes if the free slots exceed what is still owed to the other
  projects that are asking (or have not spoken again). The slots of whoever asks for nothing are
  lent.
- **Machine saturated.** As soon as a runtime says it is withholding for "machine saturated" while
  tickets are queued, `E` becomes `T` — the number of cooks in flight — and the shares are
  computed on it. No more borrowing: only a project under its effective share passes. The one
  that took the machine does not launch again; the one that waits passes at the next cook end,
  when its own station sees the machine breathe. The arbiter does not read the machine: each
  station already does, and it is the station that holds back a launch the machine would not
  carry.
- **No preemption.** The arbiter never kills a cook: it holds back the next one.
- **A project asks only for what it could launch**: held by a limit the arbiter does not lift
  ("stop", breaker, red base, connection, quota, its own cap on cooks), its queued tickets reserve
  nothing at the others.
- **A known project that has not spoken again** since the arbiter started keeps its share
  **reserved**, and as long as there is one, **nobody borrows**: its cooks are unknown.
  `run arbiter` names it, and says since when. Its share is freed when it speaks again, when its
  runtime stops cleanly, or when the chef removes it (`run arbiter -- remove <project>`).

The arbiter counts **ticket** cooks only, like the station's cap: a manager's judgment or a
reviewer's reading holds nothing back.

## Runtime side

`BRIGADE_ARBITER_PORT`, **optional**, designates the arbiter (loopback). It is the same for the
arbiter and for the runtimes.

- **Absent**: the runtime runs as before. No degraded mode, no warning.
- **Set**: the station consults the arbiter last — after its own limits — for each ticket it is
  about to take. Refused, it withholds (`arbiter`) and asks again at the next wake-up.
- **Set, and the arbiter does not answer** — connection refused, unreadable answer; a ten-second
  timeout is only a guard: **degraded mode**. The project launches anyway, **at most one ticket
  cook at a time**. This is written once at entry (`station.unarbitrated`, a line in
  `journalctl`), once at return (`station.arbitrated`); each cook that left this way carries
  `unarbitrated: true` in its `cook.launched`; `status` and `station` show it as long as it lasts.
  The cooks already gone finish. On return, the arbiter recounts from what the runtimes tell it
  again, unarbitrated cooks included.

## What the chef reads and sets

`npm --prefix runtime run arbiter`:

- the account cap, the cooks in flight, and whether the machine is said to be saturated (by whom);
- per project: weight, cooks in flight (including those that left without an arbiter), share, what
  the arbiter **still** allows, whether it has demand, and the **cook consumption** over a sliding
  24 h and 7 days — what the ticket cooks finished in the window consumed, not the account's
  consumption (#63);
- the projects that hold a share without having spoken again, and since when.

`-- weight <project> <n>` (integer ≥ 1, default 1, durable, no expiry) and
`-- remove <project>`. Arbiter unreachable, the command says so, recalls the degraded mode, and
shows the settings.

## Technical decisions

- One process (`tenir-arbitre.ts`), one `brigade-arbitre.service` unit, a lock on its state
  directory. HTTP on `127.0.0.1`, port read from the environment; port 0 in the tests, one arbiter
  per test.
- The runtime reaches the arbiter without going through the project's door: the loopback stays
  open under partition.
- The settings are written into the arbiter's database, not over HTTP: a cook, which reaches the
  loopback, does not set the weights. **Stated limit**: a cook can speak to the arbiter on behalf
  of a project; it would skew a count that the runtime restates at the next exchange.
- The decision is a pure function (`decider`), tested alone; "what is still allowed" is computed
  by replaying it.
- **Stated limit**: a runtime that died without saying so leaves its last word with the arbiter
  until it speaks again (systemd restarts it) or the chef removes it. No deadline expires it:
  nothing here runs against the clock.
- A refused project asks again at its next wake-up — the tick at the latest (one minute).

## Out of scope

The container (#176); the capabilities and the Mac runner (milestone 6); the budgets per domain
and any decision based on consumption (milestone 8) — the total is **informative** here.

## Plan

1. `decider` and the shares, bare.
2. The arbiter: durable settings, each project's last word, HTTP.
3. `arbitrage.ts`: the configuration and the exchange on the runtime side.
4. The station: consultation, `arbiter` withholding, degraded mode, what it restates.
5. The kitchen with two projects: the machine saturated by the first, the second ends up leaving.
6. `run arbiter`, `tenir-arbitre.ts`, the unit, `status` / `station`, the living doc.
