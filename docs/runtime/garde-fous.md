## The guardrails

| Guardrail | What happens |
|---|---|
| Cap on duration, tokens | A cook going over one is stopped. Tokens count input, output and cache writes, not cache reads. **No cap on turns**: these two caps bound what a ticket spends |
| Idle | A cook that produced nothing since the idle delay is stopped |
| Breaker | After N failures in a row, no more cooks are launched. A failure is a cook that exited in error or could not be launched. Not counted: a ticket's cook stopped by a guardrail (cap, idleness, lapsed lease) — but a launch off any ticket, a manager judgement or a review stopped by one still counts —, a cook whose delivery is judged red (a manager relaunch whose delivery is red, `relaunch.judged`, counts for nothing; its green one still clears the counter), the "stop", an exhausted quota, an expired Max connection, a model refusal, a runtime restart |
| "stop" | Every running cook is stopped within the second, and none is launched |

Stopping a cook: `SIGTERM` to its process group, then `SIGKILL` ten seconds later. On Windows the
process tree is read from the process table (`Win32_Process`, PowerShell) and killed at once, no
grace (`runtime/src/arbre.ts`); a relayed cook is killed by its pid. Whatever a cook started and
that still lives at its exit is killed too. **An open breaker and the "stop" both hold**, restarts
included, until "resume".

### In a row, across several cooks

The breaker counts failures of **all** the project's launches (cooks, reviews, manager judgements) on
a single counter, **in launch order**: failures among those launched **after the last success**,
since your last "resume". A manager relaunch counts as a success only once judged green. The caps
stay **per cook**.

### On the GitHub-only path

A project on the GitHub-only state (`githubOnlyState`, [`../reglages.md`](../reglages.md)) keeps the
same guardrails (#2213, `runtime/src/github-seul/garde-fous/`). Before each claim, its station reads,
in this order:

- **the "stop"** and **the breaker**, from the log, as the old station does: either one holds, no
  ticket is claimed;
- **the Max quota**: a GitHub-only cook (or review) whose stream says the quota is spent writes
  `station.86` with its return time (one hour if none is given), and nothing is claimed before it;
- **the arbiter** ([`cloison-et-arbitre.md`](cloison-et-arbitre.md)), last, for each ticket it is
  about to claim. Refused, it claims nothing this turn; unreachable, at most one cook at a time. At
  the end of every turn the project says its state again (cooks running, tickets waiting), and gives
  its share back when the runtime stops. On this path the arbiter is the GitHub-only station's alone:
  the old station does not speak for the project.

What holds the station is written once per change (`station.held`, reason `stopped`, `breaker`,
`quota`, `arbiter` or `unarbitrated`; `station.released` once nothing does). Cooks and reviews are
launched by the runtime's guardrails, off any ticket and under the station's name: the "stop" stops
them within the second (the ticket is given back on its issue), their failures count for the
breaker, the caps are the project's. A cook stopped by a cap counts as a failure here, as any
launch off a ticket does.

### The breaker on GitHub

An open breaker is also **an issue of the project's repository**, labeled `brigade:breaker-open`
(`runtime/src/breaker-issue.ts`): its body names the failing ticket, its exit code and the time the
breaker opened. An issue already open for this kitchen is reused, never doubled — its body carries
`<!-- brigade:breaker-open project=<project> -->`. On "resume", the issue receives a comment saying
the kitchen is resumed, and is closed. The label is created if the repository lacks it. Nothing is
added to the log: the runtime reads the breaker at every wake-up and publishes only what changed —
at startup it reads GitHub once, so a breaker closed while it was down still closes its issue. A
failed publication is said once and retried at the next tick.

### See and command

```bash
npm --prefix runtime run guardrails             # the state
npm --prefix runtime run guardrails -- stop     # stops everything
npm --prefix runtime run guardrails -- resume   # reopens the kitchen, closes the breaker
```

"stop" and "resume" are logged in the name of the `chef`; the runtime sees them within a second. The
state shows `caps per ticket`, `pass judgements` (`3 at once at most — … (BRIGADE_MAX_JUDGEMENTS)`),
`kitchen`, `breaker`, `cooks running` and `latest guardrail stops`. Its output is **in English**
(`kitchen already stopped since …`); `reprendre` still answers until 2027-01-14.

**Resume from GitHub, without `ssh`** (`runtime/src/breaker-resume-github.ts`): while the breaker is
open, each GitHub poll reads the comments of the open issue labeled `brigade:breaker-open`. A comment
whose body is exactly `/resume`, posted after the breaker opened by the owner, a member or a
collaborator of the repo, plays `guardrails resume` in the runtime's process: same events, same
answer, logged to `journalctl`. Any other comment is ignored; no labeled issue, nothing to do. With
the breaker closed, nothing is read.

### The pause for the code rename

Before it starts, a code rename asks your agreement through **a slip in your queue**
(`runtime/src/pause/pause.ts`): how long the kitchen will be paused, and which in-flight tickets it
holds back (taken: its cook finishes, then its delivery waits; in pass: its merge waits).

```bash
npm --prefix runtime run guardrails -- pause yes   # the pause holds
npm --prefix runtime run guardrails -- pause no    # the slip leaves; an accepted pause is lifted; a failed rename's slip, once read, is removed
```

- **Without your "yes", nothing changes.**
- **After your "yes"**, until the pause ends: the pass still judges, but a green delivery **waits**
  (`pass.waiting`, reason `paused`); `rail merge` is refused; stations take no tickets
  (`station.held`, `paused`). Only the rename's own ticket goes through. A merge already sent to
  GitHub is not caught up with.
- **The queue says it in one line** under the head of `awaiting`, not counted as a decision:
  `paused for the code rename — for …, expected about … min — finishing their work: #12 · held: #14`.
  `status` says `kitchen PAUSED for the code rename`.
- **The pause ends** when the rename lifts it (`leverPause`) or on your "no"; the pass picks up each
  held delivery again, judging it again if the base moved.

**The rename itself** (`runtime/src/pause/renommage.ts`) starts on your "yes" alone:

1. The runtime prepares a branch on the freshly fetched head of `main`, runs
   `scripts/rename-code/rename.sh --apply` (#1039) after the worktree setup, commits, pushes and opens
   its PR.
2. It hands the PR to the pass, off the rail. Judged like any delivery (merge with base, gates,
   reviewer, CI), once green it is merged under grant within the same pause. It is the only PR the
   pause lets through.
3. Once merged, the pause is lifted.

**After the merge, the kitchen resumes by itself** (`runtime/src/pause/reprise.ts`). The held tickets
still name the old paths; they are picked up on the new tree through the moves the tool reported
(`move` lines, kept in the log):

- **Their zone** is read on the new paths: the lifting rewrites it in the log; the issue's card stays
  as written.
- **Their branch** is carried onto the new tree by the pass before judging: one more commit merging
  the integration branch and moving there what the delivery wrote, pushed, then judged; the issue says
  so. Same for a cook that left before the pause and delivers after.
- **A delivery that touched no moved file** is judged as it is.
- **A delivery that cannot be carried** (conflict with the rename) is not merged: escalated
  (`pass.escalated`, cause `rename-conflict`), taken up by the kitchen, not your queue: once back to
  a cook, then a `fix` ticket (`pass.md`).

On failure **nothing is merged** and the pause is lifted without action from you. Possible failures:
the tool, the setup, red gates, a conflict with `main`, a pass that does not judge or stops before
the merge, a closed PR. The queue keeps a `rename` slip saying why and naming the open PR; `pause no`
removes it. Without an active `merge` grant nothing goes out.

The pause lasts **less than an hour**: past 55 minutes since your "yes" (`LIMITE_DU_RENOMMAGE_MS`)
the tool is stopped if running and the pause lifted, except for a merge already sent to GitHub. Your
"no" abandons the rename just the same. An abandoned rename PR is never merged by the pass: it is
escalated (`pass.escalated`, cause `rename-abandoned`).

In the log, off any ticket: `pause.requested` (`ticket` or null, `minutes`, `inFlight`),
`pause.agreed`, `pause.declined`, `pause.released` (`why`; if the rename lifted it, `outcome`
`merged` or `failed` and the `cause`), `pause.dismissed`, `rename.started` (`run`, `branch`, `base`,
`deadline`), `rename.delivered` (`pr`, `number`, `sha`, `moves`). On a held delivery's ticket:
`rename.carried` (`branch`, `from`, `to`, `base`, `paths`) or `rename.stranded` (`branch`, `sha`,
`why`, `paths`). Each names its `request`.

**The actions the runtime quotes to you** (queue, `status`, refusals) are written as you type them:
on the box `brigade <project> <command> [arguments…]` with the service's project name
(`BRIGADE_PROJECT`) — never `run <command>`, which the box action refuses (code 66).
`npm --prefix runtime run <command>` is the dev workstation's form. `test/gestes-ecrits.test.ts`
checks every written action is accepted by the box action.

### Why did this ticket stop?

Every stop is in the ticket's log: `npm --prefix runtime run log -- <ticket>`.

| Event | Meaning |
|---|---|
| `cook.launched` | A cook leaves: calibration (`model`, `effort`), station, branch, caps, raw stream (`runs/<run>.jsonl`; errors in `.stderr`) |
| `cook.progressed` | The cook's reading at each tick: `turns`, `tokens`, `activity` (below) |
| `guard.tripped` | A guardrail stops it. `reason`: `duration`, `tokens`, `idle`, `lease` or `stop`; `limit`, `observed` |
| `cook.exited` | Process dead. `outcome`: `ok`, `failed`, `guard`, `stop`, `neutral` or `refused`; exit code, turns, tokens; `credentialsMasked`: times Claude's credentials were masked in its stream and errors ([`identites-et-secrets.md`](identites-et-secrets.md)) |
| `cook.interrupted` | The runtime stopped while the cook ran: it died with it |
| `breaker.opened`, `kitchen.stopped`, `kitchen.resumed` | The breaker opens; "stop", "resume" (off any ticket) |

### What a cook is doing right now

A cook's watcher reads its stream as it flows (`runtime/src/activite.ts`) and keeps **a single
fact**: its last action and its target. Each tick carries it to the log (`cook.progressed`,
`activity`: `doing`, `target`, `since`); `status`, `faits` and the app's card read it from there.

- **The action, in the chef's words**: `reading`, `writing`, `searching the code`, `running the
  tests`, `tests red`, `tests red, fixing`, `tests green`, `running the gates`, `gates red, fixing`,
  `checking the types`, `committing`, `pushing its branch`, `opening the PR`, `reading the ticket`,
  `running <program>`, `searching the web`, `handing a task to an agent`, `planning`, `thinking`,
  `starting`, `handing back its work`. An unnamed tool: `using the tool <name>`.
- **What it targets, never what is inside.** A file: its path, relative to the worktree when inside.
  A command: program and subcommand (`git status`, `npm install`), **no argument**, no variable, no
  quoted text or here-document. No code written, no model text, no tool output. The target goes
  through the stream's mask (Claude's credentials, the project's secrets), fits one line, keeps only
  its end past 120 characters.
- **`since`**: the same action on the same target keeps its time, so a "no progress" cook shows
  **where** it stopped and since when.
- **A cook whose stream the runtime does not read** (remote station) has no `activity`: `faits` says
  null and the card writes `activity not given`.

`faits` (`rail[].activite`) gives the activity **of the ticket**:

| Ticket state | What `activite.fait` says |
|---|---|
| taken, cook not yet gone | the station is preparing the workstation (since the take) |
| taken, cook gone | its last action; `starting` before its first reading; `null` if unsaid |
| taken, cook finished | the station is delivering its work (since the cook's end) |
| in pass | waiting for the pass, gates running, review running, judgement running (reviewed, waiting for the CI); after the verdict: judged green/red, the pass decides; merging; the pass waits (or gates replayed later: machine saturated, no test failing); stopped by the pass; escalated to the chef |

### Setting the caps

Through the runtime's environment. Absent, a variable takes its default; unreadable, the runtime
**refuses to start**.

| Variable | Default | Role |
|---|---|---|
| `BRIGADE_MAX_MINUTES` | 60 | Duration of a cook |
| `BRIGADE_MAX_TOKENS` | 2,000,000 | Tokens per cook |
| `BRIGADE_IDLE_MINUTES` | 10 | Silence tolerated before concluding idleness |
| `BRIGADE_BREAKER_FAILURES` | 3 | Failures in a row that open the breaker |
| `BRIGADE_MAX_JUDGEMENTS` | 3 | Deliveries the pass judges at once, those whose zones do not overlap ([`pass-merge.md`](pass-merge.md)). 1: one at a time |
