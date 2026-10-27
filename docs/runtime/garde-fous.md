## The guardrails

| Guardrail | What happens |
|---|---|
| Cap on turns, duration, tokens | A cook that goes over one is stopped. Tokens count input, output and cache writes — not cache reads |
| Idle | A cook that has produced nothing since the idle delay is stopped |
| Breaker | After N failures in a row, no more cooks are launched. A failure: a stop by cap, idleness or lapsed lease, or a cook that exited in error — **without having committed anything**; or a relaunch decided by the manager whose delivery is judged red (`relaunch.judged`). Not counted: the "stop", an exhausted quota, an expired Max connection, a model refusal, a runtime restart |
| "stop" | Every running cook is stopped within the second, and none is launched any more |

Stopping a cook: `SIGTERM` to its process group, then `SIGKILL` ten seconds later. On Windows, which
has neither process groups nor signals, the cook's process tree is read from the process table
(`Win32_Process`, through PowerShell) and every process in it is killed at once, with no grace
(`runtime/src/arbre.ts`); a relayed cook is killed by its pid, and its relay writes its end as
elsewhere. Whatever a cook started and that still lives when it exits is killed too, on every
platform. **An open breaker and the "stop" both hold**, restarts included, until "resume".

### In a row, across several cooks

The breaker counts the failures of **all** the project's launches — cooks, reviews, manager
judgements — on a single counter, **in launch order**: the number of failures among the cooks
launched **after the last one that succeeded**, since your last "resume". The delivery of a manager
relaunch only counts as a success once judged green. If the last three launched fail, it opens,
however many successes came before. The caps stay **per cook**.

### See and command

```bash
npm --prefix runtime run guardrails             # the state
npm --prefix runtime run guardrails -- stop     # stops everything
npm --prefix runtime run guardrails -- resume   # reopens the kitchen, closes the breaker
```

"stop" and "resume" are written to the log in the name of the `chef`; the runtime sees them within a
second. The state shows `caps per ticket`, `kitchen`, `breaker`, `cooks running` and `latest guardrail stops`.

What `guardrails` writes — state, `stop`, `resume`, refusals, errors — is **in English** (words from `docs/glossary.md`): `kitchen already stopped since …`, `nothing to resume: the kitchen is open and the breaker closed`. `reprendre` still answers, saying `resume` (until 2027-01-14).

### The pause for the code rename

Before it starts, a code rename asks for your agreement through **a slip in your queue**
(`runtime/src/pause/pause.ts`, `demanderPause`): how long the kitchen will be paused, and which
in-flight tickets it will hold back — taken (its cook finishes its work, then its delivery waits)
or in pass (its merge waits).

```bash
npm --prefix runtime run guardrails -- pause yes   # "yes": the pause holds
npm --prefix runtime run guardrails -- pause no    # "no": the slip leaves the queue; an accepted pause is lifted; the slip of a failed rename, once read, is removed
```

- **Without your "yes", nothing changes**: the pass merges, the stations take tickets.
- **After your "yes"**, and until the pause ends: the pass still judges, but a green delivery
  **waits** instead of being merged (`pass.waiting`, reason `paused`); `rail merge` is refused;
  stations take no more tickets (`station.held`, reason `paused`). Only the rename's own ticket, if
  it has one, goes to the kitchen and is merged. A merge already sent to GitHub before the "yes" is
  not caught up with.
- **The queue says it in one line**, under the head of the `awaiting` block, without counting as a
  decision: `paused for the code rename — for …, expected about … min — finishing their work: #12 · held: #14`.
  `status` says `kitchen PAUSED for the code rename`.
- **The pause ends** when the rename lifts it (`leverPause`), or on your "no". The kitchen restarts
  by itself: the pass picks up each held delivery again, and judges it again if the base moved.

**The rename itself** (`runtime/src/pause/renommage.ts`) starts on your "yes", and on that alone:

1. The runtime prepares a branch on the head of `v2`, which it has just fetched, runs
   `scripts/rename-code/rename.sh --apply` (#1039) there after the worktree setup, commits the
   renamed tree, pushes it and opens its PR.
2. It hands the PR to the pass, off the rail, like the notebook's delivery. It is judged like any
   delivery: the merge with the base, the gates, the reviewer and the CI. Once green, it is merged
   under grant within the same pause. It is the only PR the pause lets through.
3. Once merged, the pause is lifted and the kitchen restarts.

**After the merge, the kitchen resumes by itself** (`runtime/src/pause/reprise.ts`): the pass
merges again, the stations take tickets again. The tickets the pause held back still name the paths
from before the rename; they are picked up on the new tree, through the moves the tool reported
(its `move` lines, kept in the log):

- **Their zone** is read on the new paths, like that of any ticket on the rail: the lifting rewrites
  it in the log, and each re-read of a card translates it the same way. The issue's card stays as
  you wrote it.
- **Their branch** is carried onto the new tree by the pass, before judging it: one more commit,
  which merges the renamed `v2` and moves there what the delivery had written. It is pushed, then
  judged like any delivery, and the issue says so. The same goes for a cook that left before the
  pause and delivers after it.
- **A delivery that touched no moved file** is judged as it is.
- **A delivery that cannot be carried** (what it changes conflicts with what the rename wrote) is
  not merged. It is escalated (`pass.escalated`, cause `rename-conflict`), and the kitchen takes it
  up, not your queue: it goes back once to a cook, with the conflict, then to a `fix` ticket if it
  comes back (`pass.md`, "A technical escalation goes to the kitchen").

On failure, **nothing is merged**, and the pause is lifted with no action from you. The possible
failures: the tool, the setup, red gates, a conflict with `v2`, a pass that does not judge or stops
before the merge, a closed PR. The queue then keeps a slip, `rename`, which says why and names the
PR left open. `pause no` removes it once read.

Without an active `merge` grant, nothing goes out: the pass would not merge the rename.

The pause lasts **less than an hour**: past 55 minutes since your "yes" (`LIMITE_DU_RENOMMAGE_MS`),
the tool is stopped if it is still running, and the pause is lifted all the same. The one exception:
a merge already sent to GitHub, whose outcome is awaited. Your "no" on the pause in force abandons
the rename just the same. An abandoned rename PR is never merged by the pass, even once the pause is
lifted: it is escalated without a merge (`pass.escalated`, cause `rename-abandoned`).

In the log, off any ticket: `pause.requested` (`ticket` of the rename or null, `minutes`,
`inFlight`), `pause.agreed`, `pause.declined`, `pause.released` (`why`; and, when the rename lifted
it, `outcome` — `merged` or `failed` — with the `cause` of a failure), `pause.dismissed`,
`rename.started` (`run`, `branch`, `base`, `deadline`) and `rename.delivered` (`pr`, `number`,
`sha`, `moves`). On the ticket of a held delivery: `rename.carried` (`branch`, `from`, `to`, `base`,
`paths`) or `rename.stranded` (`branch`, `sha`, `why`, `paths`). Each names its request (`request`).

**The actions the runtime quotes to you** (the queue, `status`, the refusals) are written in the
form you type where you read them: on the box, `brigade <project> <command> [arguments…]`, with the
service's project name (`BRIGADE_PROJECT`) — never `run <command>`, which the box action refuses
(code 66). `npm --prefix runtime run <command>` is the dev workstation's form; both run the same
command. The test `test/gestes-ecrits.test.ts` checks that every written action is a command the
box action accepts.

### Why did this ticket stop?

Every stop is in the ticket's log: `npm --prefix runtime run log -- <ticket>`.

| Event | Meaning |
|---|---|
| `cook.launched` | A cook leaves, with its calibration (`model`, `effort`), its station, its branch, its caps and its raw stream (`runs/<run>.jsonl` in the state directory; its error output in `.stderr`) |
| `cook.progressed` | The cook's reading at each tick: `turns` and `tokens`, and `activity` — what it is doing right now (see "What a cook is doing right now") |
| `guard.tripped` | A guardrail stops it. `reason`: `turns`, `duration`, `tokens`, `idle`, `lease` or `stop`; `limit` and `observed` |
| `cook.exited` | The process is dead. `outcome`: `ok`, `failed`, `guard`, `stop`, `neutral` or `refused`; exit code, turns, tokens; `credentialsMasked`: how many times the shape of Claude's credentials was masked in its stream and its error output (see "Not published in what a cook says, either", in [`identites-et-secrets.md`](identites-et-secrets.md)) |
| `cook.interrupted` | The runtime stopped while the cook was running: it died with it |
| `breaker.opened`, `kitchen.stopped`, `kitchen.resumed` | The breaker opens; "stop", "resume" (off any ticket) |

### What a cook is doing right now

A cook's watcher reads its stream as it flows (`runtime/src/activite.ts`) and keeps **a single
fact** from it: its last action, and what it targets. Each tick's reading carries it to the log
(`cook.progressed`, `activity` field: `doing`, `target`, `since`), and that is where `status`,
`faits` and the app's card read it — at the pace of the rest, once per tick.

- **The action, in the chef's words**: `reading`, `writing`, `searching the code`, `running the
  tests`, `tests red`, `tests red, fixing` (what is written after red tests, until they pass again),
  `tests green`, `running the gates`, `gates red, fixing`, `checking the types`, `committing`,
  `pushing its branch`, `opening the PR`, `reading the ticket`, `running <program>`, `searching the
  web`, `handing a task to an agent`, `planning`, `thinking` (between two tools), `starting`,
  `handing back its work`. A tool with no name for the chef is said by its own: `using the tool <name>`.
- **What it targets, never what is inside.** A file read or written: its path, relative to the
  cook's worktree when it is inside. A command: its program, and its subcommand for those that have
  one (`git status`, `npm install`) — **no argument**, no variable set in front, nothing it quotes
  between quotation marks or in a here-document. Neither the code written, nor what the model says
  or thinks, nor what a tool returns comes out. The target goes through the same mask as the stream
  (Claude's credentials, the project's secrets), fits on one line, and keeps only its end past 120
  characters.
- **`since`: since when it has been doing this.** The same action on the same target keeps its
  time; a "no progress" cook thus shows **where** it stopped, and since when.
- **A cook whose stream the runtime does not read** — one on a remote station — has no `activity`:
  nothing is invented, `faits` says it is null and the card writes `activity not given`.

What `faits` says (`rail[].activite`) is the activity **of the ticket**, not only of the cook:

| Ticket state | What `activite.fait` says |
|---|---|
| taken, cook not yet gone | the station is preparing the cook's workstation (since the take) |
| taken, cook gone | its last action; `starting` before its first reading; `null` if its reading does not say |
| taken, cook finished | the station is delivering its work (since the cook's end) |
| in pass | waiting for the pass, then gates running, review running (the reviewer is running), judgement running (reviewed, the pass waits for the CI); after the verdict: judged green, the pass decides; judged red, the pass decides; merging; the pass waits — or, when its gates were cut off on a saturated machine, gates replayed later: machine saturated, no test failing —, stopped by the pass, escalated to the chef |

### Setting the caps

Through the runtime's environment. When absent, a variable takes its default; when unreadable, it
makes the runtime **refuse to start**.

| Variable | Default | Role |
|---|---|---|
| `BRIGADE_MAX_TURNS` | 100 | Turns per cook |
| `BRIGADE_MAX_MINUTES` | 60 | Duration of a cook |
| `BRIGADE_MAX_TOKENS` | 2,000,000 | Tokens per cook |
| `BRIGADE_IDLE_MINUTES` | 10 | Silence tolerated before concluding idleness |
| `BRIGADE_BREAKER_FAILURES` | 3 | Failures in a row that open the breaker |
