# Manager handover — design

**Date**: 2026-09-11
**Status**: validated, ready for an implementation plan
**Scope**: `commands/manager.md`, `README.md`, Codex mirror, plugin version

---

## The problem

The brigade protocol knows that an inherited context is a rent, not an asset. It says so for
dev-teammates — "one teammate = one issue", "we don't extend it, we replace it" — and the
permanent-dev-employee outage (2026-08-27) puts a number on it: a factor of 26 in cache tokens for
the same delivered work.

**The Manager meets exactly the same condition, and has no rule.** It drains in an event-driven
loop for hours, integrates PR after PR, and its context never goes back down. Yet its state lives
entirely in the artifacts — that is the protocol's founding principle — so nothing justifies it
carrying that state in memory.

## What the transcripts measure

Measured on **22 Manager sessions** (2 projects, 5,586 requests, 1,087 Mtok of input), extracted
from the `~/.claude/projects/*/*.jsonl` transcripts.

### The Manager lives above the long-context threshold

```
mean context per request: 195k
  0-100k     958 req  17.2%    72 Mtok   6.6%
  100-150k  1211 req  21.7%   151 Mtok  13.9%
  150-200k  1119 req  20.1%   196 Mtok  18.1%
  200-220k   429 req   7.7%    90 Mtok   8.3%
  220-260k   618 req  11.1%   147 Mtok  13.5%
  260-400k   965 req  17.3%   308 Mtok  28.4%
  >400k      269 req   4.8%   122 Mtok  11.2%

41% of requests exceed 200k — and account for 61.4% of its tokens.
Longest session: 965 turns, 24 merges, peak at 517k.
```

A single automatic compaction in 5,586 turns: nothing slows the growth.

### Growth is linear and indexed on merges

```
median context at the Nth merge of the session
  merge 1 → 126k      merge 5 → 234k
  merge 2 → 159k      merge 7 → 319k
  merge 3 → 190k      merge 8 → 375k
  merge 4 → 210k  ← threshold crossed
```

**+30k per integrated issue.** The trigger therefore does not need a token measurement that the
Manager cannot read: counting its merges is enough, and it already keeps that history in the
roadmap.

### The dead point exists

Dead point = no dev in flight, after the 3rd merge.

```
occurs in 13 of the 15 sessions that reach 3 merges (87%)
median context at the first dead point: 190k   (min 134k, max 346k)
median of 3 dead points per session
2 sessions reach 3 merges without ever a dead point
```

The dead point falls naturally **just under the threshold**, with no tuning. But it is late in 3
sessions out of 22 — and those are the longest, hence the most expensive.

### Simulated gain

Simulation by trace replay: at each handover, the context restarts from the measured startup (43k)
plus the cost of a situation report, then follows the same slope as observed.

```
recap    threshold    simulated input    gain    handovers
15k      3            630 Mtok      42%       25
30k      3            666 Mtok      39%       25
50k      3            714 Mtok      34%       25
80k      3            786 Mtok      28%       25

30k      2            620 Mtok      43%       40
30k      3            666 Mtok      39%       25
30k      4            708 Mtok      35%       20
30k      5            751 Mtok      31%       14
```

**Gain retained: ~39% of the Manager's input**, and the share of tokens at long-context pricing
falls from 61% to 15%. The result holds even under a deliberately pessimistic recap hypothesis
(80k, nearly double the startup context): 28%.

The threshold of 3 is the compromise retained — a threshold of 2 gains 4 more points at the price
of 60% more handovers, hence as many disruptions to the draining.

**Point of comparison**: command-output compression (rtk type), evaluated on the same data, caps
at 2.1% without degrading the protocol's evidence. Two orders of magnitude separate the two
levers. That is what ruled out the tooling track in favor of the protocol track.

---

## Design

### 1. The handover rule

Added to the non-negotiable rules of the Manager role:

> **You hand yourself over.** As soon as you have integrated **3 issues** and **no dev-teammate is
> in flight**, you hand over: a fresh Manager takes the loop back. If you reach **5 integrations**
> without that dead point showing up, **stop spawning** — drain what is in flight, and hand over
> as soon as the last dev has delivered.

Two definitions, to be fixed without ambiguity in the role:

- **"integrated"** = any PR you merged, whether it comes from a dev-teammate or from the Designer.
  The merge is what makes your context grow — gates, diff review, close-out — not the origin of the
  PR.
- **"in flight"** = a dev-teammate that **you** spawned and whose PR has not yet been merged. The
  Designer is **never** in flight in your sense: it is an independent human session that you do not
  spawn and whose pace you do not control. Waiting for the Designer before handing over would mean
  never handing over.

Two thresholds, two distinct roles:

- **3 merges + no dev in flight** — the normal regime. Opportunistic handover, lossless: no
  teammate is killed, no unpushed work is lost, no throughput dip.
- **5 merges without a dead point** — the safety net. The Manager stops spawning; the dead point
  then occurs mechanically within one or two cycles. Only kicks in for the residual cases (3
  sessions out of the 22 measured), so normal throughput is never dented.

The counter does not live in memory: it is recounted from the dated history of close-outs that the
Manager already keeps in the roadmap (§7 of the role). A counter in memory would be a second truth,
and would disappear at the first crash.

### 2. The handover transmits nothing

**The outgoing Manager writes no handover document.** This is deliberate, and it is the direct
consequence of the founding principle: all coordination lives in durable artifacts, never in the
memory of a session. A handover document would be precisely the kind of memory the protocol
refuses — and a second source of truth next to the roadmap.

The handover is therefore a **checkpoint**, not a transfer. Before leaving, the outgoing Manager
checks what it was already supposed to keep up to date:

- `main` pushed, no unpublished local lead;
- roadmap up to date (order + history of close-outs);
- no orphan worktree;
- waiting issues labeled `blocked-on-human`.

If it cannot tick these boxes, **it is not allowed to hand over**: it updates them first. This
constraint is a secondary benefit of the design — a Manager unable to hand over is a Manager that
let its artifacts drift, and the handover reveals it at regular intervals instead of letting it be
discovered at the next crash.

### 3. "Crash recovery" becomes "Handover and recovery"

§6 of the Manager role already contains the whole reconstruction procedure: situation report,
re-spawn of a fresh dev for each unfinished issue picking up the existing worktree, return to the
draining loop. **Not a single line of this procedure changes.**

Only its status changes: from a contingency plan reserved for the accident, it becomes the normal
regime with two triggers — the voluntary handover and the crash. The title and the introductory
sentence are rewritten accordingly.

### 4. The relaunch lives outside the plugin

A Manager cannot relaunch itself: it is the main session, and orchestration requires an
interactive session. The relaunch is therefore the job of an external supervisor.

**brigade imposes nothing and depends on nothing** — consistent with its treatment of `gates.sh`,
of which it only knows the contract. The README documents the behavior (the Manager stops by
itself, cleanly, after passing its checkpoint) and gives the relaunch pattern as an example,
without requiring it:

```bash
while true; do claude "/brigade:manager"; sleep 5; done
```

The permission mode of this loop is up to the environment that hosts it, not the protocol: an
unattended relaunch presupposes choices that brigade has no business making for its user.

Without a supervisor, the handover is still useful: the Manager stops cleanly and the human
relaunches when they next come by. With a supervisor, the draining loop becomes continuous while
keeping a bounded context.

---

## Files touched

| File | Change |
|---|---|
| `commands/manager.md` | The handover rule in the non-negotiable rules; §6 renamed "Handover and recovery" with its two triggers; the checkpoint before handing over |
| `README.md` | "Cost" section: the handover as a third lever, with the measured figures; mention of the external relaunch in the prerequisites and limits |
| `.claude-plugin/plugin.json` | Version bump (the rule has to flow down into the projects) |
| Codex mirror | No direct edit — `/brigade:sync` to be replayed after the plugin update |

## What does not change

Explicitly out of scope, to avoid any drift during implementation:

- The state reconstruction procedure (§6) — reused as is.
- The rules for spawning, partitioning by file zone, gates and merge.
- The dev role, the PO role, the Designer role.
- `gates.sh` and `worktree-setup.sh` — no third contract script is introduced.
- The verbosity of command outputs: measured, judged unprofitable, set aside.

## Risks and limits

- **The successor may repay work** (re-qualification, re-reading artifacts). This is what the recap
  hypothesis covers; the gain holds up to 80k, nearly double the measured startup context.
- **The rule is prompt, hence fallible.** A Manager may forget to count. The fact that the counter
  can be recomputed from the roadmap limits the damage, without eliminating it.
- **Effect on dev-teammates not measured.** No teammate appears in the transcripts
  (`isSidechain` always false, `userType=external` everywhere) despite 115 spawns. A handover at the
  dead point kills none by construction, so the expected effect is nil — but the data does not
  prove it.
- **The measures come from a protocol at 0.6.0**, four versions before the current one, hence
  before "one teammate = one issue" came into force (0.10.0). Two distinct consequences. The
  growth of the Manager's context is not affected: it comes from what it integrates — gates, diff
  review, close-out —, not from how it manages its devs. On the other hand the "dev in flight"
  estimator assumes that a dev dies at the merge of its PR, which was false when devs were reused
  via `SendMessage` (87 spawns for 114 merges). The number of dead points is therefore probably
  **underestimated**: under 0.10 and beyond, a dev dies well after its PR, so the rule should fire
  more often, not less. This is reasoning, not a measurement — to be confirmed once the current
  version is deployed.
- **The gain is simulated, not observed.** The simulation replays the real traces under a linear
  growth model, validated by observation (+30k/merge). It remains a model.
- **Estimated tokens**: the context figures come from the `usage` fields of the transcripts, hence
  from the provider's actual count. No `bytes/4` estimate enters the figures of this document.

## Success criteria

Verifiable by replaying the same measurement after a few weeks of use, **on the current version of
the protocol** — the reference measurement above dating from 0.6.0, the comparison is only valid
between two readings taken after the deployment:

1. The Manager's median context per request goes **under 200k** (measured: 195k mean, with 41% of
   requests above).
2. The share of input tokens at long-context pricing falls **under 30%** (measured: 61.4%).
3. No Manager session exceeds **8 merges** without a handover (measured: up to 24).
4. No throughput regression: the number of issues integrated per day does not drop.

Criterion 4 is the design's safeguard. If the handover makes throughput drop, it is the draining
threshold that is at fault, and that is what needs loosening — not the rule.

## Measurement method

The figures in this document come from a transcript analysis script which, for each session
identified as a Manager (by dominant occurrence of `brigade:<role>`), extracts for each assistant
request the sum `cache_read + cache_creation + input` of the `usage` field, and correlates this
series with the `Agent` (spawn) and `gh pr merge` (integration) events.

The script is not versioned at this stage. The implementation plan will decide whether it joins
`scripts/`, which would make the success criteria replayable by anyone — to be weighed against the
fact that it reads transcripts, hence session data.
