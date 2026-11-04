## The observing closing

The measures say what the project **weighs**; the observing closing says what it **has not removed**.
`npm --prefix runtime run closing` (`brigade <projet> closing` on the box) reads the integration
branch of the project's clone — `origin/<BRIGADE_BASE_BRANCH>` in `BRIGADE_REPO_DIR`, as the last
fetch left it — and prints three things:

| Block | What it says | How it is counted |
|---|---|---|
| `ratio` | The lines added and removed (`+added / −removed`) and their ratio, over the latest 20, 50 and 100 merges | The branch's merge commits, each against its **first parent**; a commit put straight on the branch is not a merge |
| `duplicates` | Each run of at least 8 identical lines of code in two places (`path:start-end`), the longest first | Text compared with text: indentation, blank lines, comments and pure punctuation do not count. A third copy is given once |
| `dead code` | Each named export of a TypeScript or JavaScript file that nothing else names (`path:line`) — or that only tests name | A name searched in every file of the branch, docs excepted. An export its own file reuses is alive |

- **It modifies nothing**: no file, branch, PR or fact, and it does not fetch. It only plays `git`
  commands that read, without a lock, so it runs while the cooks work and the pass merges.
- **It spots, it does not judge**: its findings are candidates, to be read (an export that a framework
  reads by convention is named by no one; two dead exports with the same name keep each other alive).
- **When there is nothing**, it says `none spotted` and among how many files it searched. A branch of
  fewer than 20 merges gives its ratio over the ones it has. A file of more than 1 MB is not read, and
  the output counts those set aside.
- The `log` block takes up the counters of the measures when `BRIGADE_STATE_DIR` carries a log;
  `BRIGADE_REPO_DIR` and `BRIGADE_BASE_BRANCH` are required. Its `pass` line says where the last
  writing pass stands, followed by the **summary** of the last one that finished.

### The same reading, for the app

`npm --prefix runtime run closing -- --json` (`brigade <projet> closing --json`) gives the same
reading as **one JSON object, on one line**. It launches nothing and writes no request. It needs
`BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR` and `BRIGADE_BASE_BRANCH`; without a log it exits with 1.

- `configured`: is the closer set? False: the object carries only `text`.
- `closer`: its calibration and caps in force, and `from`, where each comes from (`repository`,
  `station` or `default`); null when the runtime that noted them predates it.
- `observation`: `mergesSinceCleanup`, `ratio` (per window: `added`, `removed`, `ratio`, `reads`),
  `duplicates`, `deadExports`; `readable` false: `error` says why.
- `findings`: each duplicate and dead export under its pass name (`D1`, `M1`…): `file`, `start`,
  `end`, and for a duplicate its `copy`.
- `request`: `none`, `waiting` (`reason`; `stalledAt`: with no way out), `running`, `refused`
  (`reason`), `cancelled`, `done` (`outcome`, `removed`, `pr`, `kept`). Each `reason` carries its
  `code` and sentence.
- `drift`: `crossed` (a threshold the chef declared); `declared` false when none.

## The writing closing

The observing closing touches nothing; this one **removes**, and it is the most dangerous agent in the
system: a closer that gets it wrong **erases good code**, and the gates will say "it still works",
since what disappeared was tested by nothing. So it leaves only on **a request** — your gesture, or
the runtime's own —, under a measured start condition, and under all the guardrails.

```
brigade <project> closing write    # npm --prefix runtime run closing -- write
brigade <project> closing cancel   # npm --prefix runtime run closing -- cancel
```

- **Nothing else launches it**: not a clock, not a restart. A request that the runtime had not sent
  off before it stopped is refused when it comes back (`restarted`, in journald); request it again.
- **It is off the rail**: no ticket, no priority; its closer leaves under the `closer` station.
- **It merges nothing and never pushes onto the integration branch.** What it removes goes onto its
  branch (`cook/fermeture-<8 characters>`) and into **one PR**, handed to **the pass**.

### The automatic trigger

For a project whose closer is set, the runtime **requests the pass on its own** as soon as one of two
symptoms shows since the last pass that left (`closing.started`):

- **20 merges** on the integration branch: the `merge.done` facts since then, whoever merged, the
  closing PR's own included. With no pass ever, every merge of the log counts.
- **A drift threshold crossed**: a `drift.crossed` fact since then (see "Thresholds, and what warns
  you" in `etat-et-mesures.md`). A threshold that stays crossed after a pass does not trigger again;
  only a new crossing, after `drift.cleared`, does.

The request is the same as yours (`closing.requested`, author `runtime`), and everything this page says
of a pass holds for it.

- **One pass a day per project, at most**: no request within **24 hours** of the previous one,
  whatever became of it; what happened meanwhile is requested once the day is over.
- **It does not request what would be refused**: not while a request waits or a pass tidies, not
  under "stop" nor with the breaker open (it requests at the first wake-up after "resume"). A request
  that finds nothing to remove (`nothing`) has not left: the counters do not restart, and the next
  day it is requested again.
- **A project with no closer set is never touched.** **Your gesture is not capped**: `closing write` works even on a day the runtime requested.

### The closer is set, or there is none

By the same gesture as the chef's other decisions — `station -- closer-modele <model>`,
`closer-effort <effort>`, `closer-cooks <N>`, `closer-tokens <N>`, `closer-retraits <N>` —, logged,
without `sudo` or a restart; `remove <gesture>` goes back to the variable. A decision wins over the
variable of the same name and holds from the next pass on. `station` shows the decisions set and the
settings in force. Without a calibration, the project has no writing pass and the command refuses,
naming the gesture; a calibration with one half missing, or an unreadable value, makes the start be
**refused**. These values stay in the state directory's log, out of a cook's reach.

**The project's repository comes first** (#1684). The `closer` field of `.claude/brigade/projet.json`
([`../reglages.md`](../reglages.md)) carries the same settings: `calibration` (`{ "model", "effort"
}`), `cooksBelow`, `maxTokens`, `maxRemovedLines`. Each one it sets wins over the box's decision of
the same name; each one it leaves out stays the box's, then the default. Every station reads the file
on `origin/<integration branch>` as its last fetch saw it and rereads it at each wake-up, with no
restart. A gesture on the box for a setting the file sets is still written, and `station` says it is
ignored. `station` says where each value comes from — on each decision row and under **closer in
force** —, and so does `closing --json` (`closer.from`).

| Variable | Default | Role |
|---|---|---|
| `BRIGADE_CLOSING_MODEL`, `BRIGADE_CLOSING_EFFORT` | none | The closer's calibration — it is your quota, it has no default |
| `BRIGADE_CLOSING_COOKS` | 1 | The start condition: the pass leaves when **fewer** cooks than this are in flight. `1`: none |
| `BRIGADE_CLOSING_MAX_TOKENS` | 500,000 | Tokens per pass — in place of a cook's cap, not on top of it. No cap per week |
| `BRIGADE_CLOSING_MAX_REMOVED_LINES` | 500 | Lines a pass may remove |

They are written to the log when they change (`closing.configured`), with where each comes from.

### The start condition

A writing pass moves the integration branch under the cooks in flight, so it waits for things to
calm down. **A cook in flight** is a ticket that a station holds (`taken`), or whose cook is still
running after leaving its hands; the re-reading of a ticket in pass is not one. The pass leaves when
there are **fewer than the threshold** — an empty rail carries none. This is the only door.

The command writes `closing.requested`; the runtime sees it within the second, **rereads the
condition at that moment**, and starts the pass (`closing.started`). What does not pass on its own is
refused (`closing.refused`), by the command — which exits with 1 and launches nothing — as by the
runtime. The reason codes are the runtime's and stay as they are:

| Reason | What is missing |
|---|---|
| `unconfigured` | The closer is not set |
| `busy` | A pass is already tidying up — only one at a time |
| `stopped`, `breaker` | The chef's "stop", the breaker open: "resume" first |
| `depot` | The integration branch cannot be fetched, or cannot be read |
| `nothing` | The observation spots nothing, or nothing outside what the cooks hold |

### The request waits

What passes on its own is not refused: the request **waits**, and the runtime rereads it at every
wake-up (every time the log moves, and at every tick). `closing` and `status` print the sentence.

| Reason | What holds it |
|---|---|
| `cooks` | Too many cooks in flight for the threshold (`observed`, `limit`) |
| `zoneless` | A cook in flight declares no zone: the pass cannot know what it holds, **so it holds everything** |
| `deploying` | A deployment requested was holding the pass — only read in the logs from before the station |

- **It leaves on its own, once**, at the first wake-up where nothing holds it back (the condition
  being reread in the transaction that writes `closing.started`). Nothing is reserved for it: a
  station can take the next ticket before it. The threshold stays your setting (`station --
  closer-cooks <N>`).
- **It reads in the queue** — the `awaiting` block of `status`, under `closing` — and on the `pass`
  line of `closing`. Requested again while it waits, nothing is rewritten: "already requested", exit 0.
- **You withdraw it by `closing cancel`** (`closing.cancelled`), as long as it has not left, even if
  the condition is met afterwards. Once left, it cannot be recalled: "stop" halts it, and nothing is
  delivered.
- **The "stop" or the breaker while it waits refuse it** (`stopped`, `breaker`): it does not leave
  again by itself on resume.
- **With no way out after two hours.** A request that has waited **2 h** is said to have no way out,
  once: `closing.stalled`, and its queue line becomes `CLOSING PASS WITH NO WAY OUT`, with the gestures
  that unblock it — raise the threshold, `switch off` while the rail empties, or give up. It still
  waits.

### From the app: the preview, the "yes", the withdrawal

The app requests and withdraws the pass by the same decisions as your two gestures: what `closing
write` refuses, it does not request. Each answer is a JSON object on one line, with its `outcome` and
its `text`.

```
brigade <project> closing preview [--json]          # what a pass costs, what the closer will do — writes nothing
brigade <project> closing write --json --confirm    # the request, once your "yes" is given
brigade <project> closing cancel --json             # withdraws the request that waits
```

- **The preview writes nothing** (log opened read-only, observation not replayed). It says the
  **cost** (`cost`: the calibration and caps, `null` with no closer set), **what the closer will do**
  (`does`), where the request stands (`request`), and **what a request made now would become**
  (`ifRequested`: `leaves`, `waits`, `already-requested`, `refused`, `impossible`, with its reason).
- **Nothing leaves without `--confirm`**: a typed command is your "yes"; a program's call is not.
  `write --json` without it exits with 1 (`unconfirmed`) without opening the log.
- Exit codes, as for the typed gestures.

### What it proposes, and what it holds

The pass fetches the base and replays **the observation**: its duplicates and dead exports are the
closer's candidates, each under a short name (`D1`, `M3`…), forty at most. The files of these
candidates — the test or doc that names a dead export included — are **its zone**, and the rail's file
zones hold in both directions:

- **It does not touch what a cook holds.** A candidate with a single file in the zone of a cook in
  flight, or of a ticket in pass, is not proposed — the PR says so, with the ticket that holds it.
  It is reread at delivery: a closer that wrote outside its zone, or in what a cook holds,
  **delivers nothing** (`zone`).
- **No cook starts on what it holds.** While it tidies, the rail counts its zone as that of a ticket
  that is taken: a ticket whose zone overlaps it waits, the others leave (see "File zones"). A ticket
  **with no zone** is held by nothing.

### The guardrails

The closer is launched by the guarded launch of all cooks. Each guardrail ends the pass with its own
code:

- **Token cap per pass**: `guard.tripped` `tokens` (end: `tokens`).
- **Removal cap per pass**: the lines its worktree removes, committed or not, read at every tick
  (`guard.tripped` `removals`) and counted again at its end (end: `removals`).
- **Idleness, duration, turns**: the caps of every cook ("Setting the caps") (`idle`, `duration`,
  `turns`).
- **"stop"**: `brigade <projet> guardrails stop` halts it within the second; none leaves before
  "resume" (`stop`). **Breaker**: open, none leaves; open while it tidies, it is stopped (`breaker`).

**Stopped, it delivers nothing**: no branch pushed, no PR; what it had written stays committed on its
local branch. A closer stopped by a cap, or that wrote what it did not hold, is **a failure that the
breaker counts**. It is said in `closing.ended`, in `journalctl -u brigade@<project>`, and on the
`pass` line of `closing`.

### What the closer does with its candidates

Its brief (`runtime/src/closing/brief.ts`) gives it one aim: **remove as much as it safely can**.

- **A dead export (`M…`) is deleted**, with what existed only for it — the test that exercises only
  it, the doc sentence that describes it. No test of living code is removed or weakened to make a
  removal pass.
- **A duplicate (`D…`) is factored**: one copy is kept, in one of the files the pass holds (the
  closer creates no file), and the other place calls it. Two passages that must evolve apart are
  left, saying so.
- **The safety rule**: it removes or factors only what the gates, then the CI, still prove green — it
  plays the gates after each gesture and undoes the one that turns them red. It leaves whatever a
  framework or a tool may read by convention: **entry points**, the **exported API named in `docs/`**
  (`named in docs (…)`), and **files loaded by name**. **Doubt means leave it and say so.**

### The PR, and what it left

The PR body has **four parts**, in this order, which the brief also names to the closer: `Retiré` (the
dead exports deleted), `Factorisé` (the duplicates factored), `Lignes gagnées` (the lines removed
against the lines added, and the difference) and `Laissé faute d'être sûr` (each candidate left, with
its reason).

- **Nothing is held as removed or factored on the closer's word**: the pass replays the observation
  on its branch. A candidate no longer spotted there is removed (`M…`) or factored (`D…`).
- **Left for lack of certainty**: for each candidate it does not remove, the closer writes a line
  `LAISSÉ <name> : <why>`, copied as it is. A candidate still spotted on its branch without the closer
  having named it is **left with no reason**. A folded JSON block under the four parts gives the same
  list as `{ id, location, reason }` (`location`: `<path>:<line>` for a dead export, the two
  `<path>:<first>-<last>` of a duplicate); `closing.ended` keeps `kept`.
- **Set aside before the pass**: what a cook was holding, and what went beyond the forty candidates.

A pass that removed nothing opens no PR: what it left is in `closing.ended` (`kept`).

### What a pass remembers

The pass **remembers what its closer left**, per project, and does not propose it again **unless the
code around it changed** (`runtime/src/closing/memory.ts`):

- **What is remembered**: each candidate the closer left, with its reason or "left with no reason",
  once its end is judged, whether the pass delivered a PR or removed nothing. Not what was set aside
  before the pass, nor what a pass stopped by a guardrail left.- **The fingerprint** is a hash, for each place, of its lines and the **10 lines above and 10 below**
  (trimmed, blank lines not counted), retaken at each later pass. **The same**: not proposed.
  **Another**: proposed again. **No longer spotted**: its entry dropped. A re-indentation, a blank line
  or a change elsewhere in the file does not bring it back; a changed line within ten of it does.
- **Everything left, unchanged**: the pass does not start — refused `nothing`, saying the N candidates
  were all left by an earlier pass, with the code around them unchanged since.

### The PR goes through the pass

Once its PR is open, the closing pass **hands it to the pass** in the gesture that writes its end
(`closing.ended` `delivered`, then `pass.entered`). Everything that "The pass" says of a delivery
holds for it: merge with the current base, **gates**, **reviewer**, **CI**, and green, merged only
**under the `merge` grant** (`grant.used`, then `merge.done`). Without a grant it stops green
(`no-grant`) and waits for your merge; a pass that touches its judges or the project's declarations
is never merged by the pass (`review-required`).

What changes comes from a pass having **no ticket**:

- **The pass follows it under the number of its PR** and speaks on the PR. `brigade <projet> pass`
  shows it as `PR #<n>  off the rail (run fermeture-…)`, `brigade <projet> pass <n>` tells its
  judgement, and its facts (`pass.*`, `grant.used`, `merge.done`) carry that number.
- **The reviewer is its real judge**, with a brief that is not a ticket's: it looks for what the diff
  removes and something alive still depends on, a test weakened to get a removal through, and what
  the diff does beyond what the PR announces. Green gates prove nothing there. **A removal that it
  cannot establish is safe is blocking**, where on a ticket doubt is a remark.
- **Red, nobody takes it back**: no cook is sent back, the closer does not leave again, the manager
  is not consulted. From the first red it is escalated (`pass.escalated`, `still-red`: `off-rail`),
  the pass says so on the PR, and the PR stays open: merge it by hand or close it, and start another
  pass.
- **Merged, or closed without a merge, the pass no longer follows it.** A merge by hand is noted
  (`merge.done`, `by: outside`), and the gates are replayed on the base.

### The summary of a pass

`brigade <projet> closing` gives, under its `pass` line, the summary of the last pass that finished,
reread from the log alone (nothing is replayed, its PR is not reopened). Its verdict comes first, on
one line (for example `FAILURE — gate checks : down (12 → 11), even if the gates are green`), then
the PR and how it was judged. The blocks:

| Block | What it says | Where it comes from |
|---|---|---|
| `removed` | Each candidate removed, with its path; the lines removed and added, the files written | `closing.ended`: `removed`, `removedLines`, `addedLines`, `files` |
| `left`, `set aside` | Each candidate the closer left, with its reason (or none); what was set aside before it left | `closing.ended`: `kept` |
| `slope` | The added / removed ratio of the latest 20, 50 and 100 merges of the base the pass left from, **before** and **with what it removes** — over the same merges, so what moves is due to it alone | `closing.ended`: `slope`, read at the pass's start |
| `guardrails` | Three, each with its value before, after, and its verdict (`holds`, `FAILURE — down`…) | The gates the pass played |

- **Three guardrails**: the **test coverage** has not gone down (`MESURE couverture`), the gates
  **still check as many things** (`MESURE verifications`), the **product works** (the PR's gates are
  green). The first two are what the project declares through its gates ("What the gates declare").
- **A drop is a failure, said first — even under green gates**: a closer that erases live code and
  the test that covered it leaves green gates, and that is the case the summary exists to say. Any
  drop in coverage or in the number of checks is a `FAILURE`, however small; red gates, or gates
  stopped at their duration cap, are the product's failure.
- **"Before" and "after" differ only by what the pass wrote.** "After": the gates of the last
  judgement of its PR (`pass.judged`), merged with the current base. "Before": the gates played **on
  the very tree of that base** — its check alone (`base.checked`), or the judgement of the delivery
  whose merge made it.
- **A guardrail that nothing measured is `not established`, never held**, and the head of the summary
  counts it (PR not yet judged, gates that do not declare the measure, a base on whose tree no gate
  was played).
- **If the slope has not moved, it writes "the pass was of no use"**, on the 20-merge window figure;
  the same if it rises, and for a pass that removed or delivered nothing.

### On a GitHub-only project

With the project's GitHub-only switch on (`githubOnlyState`, `docs/reglages.md`), the pass above stops
at its entry (#2218): it reads the log, which is then stale. The closer runs on GitHub instead (#2361,
`runtime/src/closer-github-passe/`), in every project's kitchen of the station, as a ticket:

- **When**: the same trigger, read from GitHub and the clone. At most every 10 minutes (`ECART_MS`), at
  a tick, a project whose closer is set is checked: **20 merges** on the integration branch (its merge
  commits, the origin fetched) since the last closing issue, **none within 24 hours**, and none still
  open. No drift threshold triggers it there, and a project with no closer set gets no issue.
- **What**: the observation on the base, as above, and **one closing issue** — `fire` and the closer's
  calibration (`model:`, `effort:`), the drift of the latest merges (added:removed per window), the
  candidates to prune (the duplicates and the dead code), their files as its `Zone`, and the removal cap
  as an acceptance criterion. Its body opens with `<!-- brigade:fermeture sha=<base> -->`: that mark,
  from an `OWNER`, `MEMBER` or `COLLABORATOR`, is how a restarted runtime or another station of the
  project finds the last pass. Two stations that open one at once keep the oldest, and close the other.
  With nothing to propose, no issue; it is said once per base.
- **Who cooks it**: the GitHub-only stations, like any ticket: it has no `prio:` and comes after the
  others; its zone keeps the other tickets off its files; the pass reviews and merges its PR.
- **The drift**: the log no longer sees a merge, so the `drift` line of `status` would freeze on the day
  the switch was turned on. At the same check, closer set or not, the pass reads the drift instead
  (`derive-github.ts`): the merges since the last closing issue (the merge commits of the base, each
  carrying its ticket by its `cook/<n>-` branch) and, for the last 10, what the GitHub-only cooks of the
  station spent on each ticket — read from their streams (`<state>/github-seul/<n>-github.flux.jsonl`),
  counted as the supervisor counts, a launch whose result is an error being lost. Against the chef's
  thresholds, with the same gauges (`merges`, `tokens_ticket`, `tokens_perdus`), it writes what is
  crossed to `<state>/derive-github.json`; while the switch is accepted, `status` takes its `drift` line
  from that file, not from the log, and a threshold newly crossed is said once. The gates' measures
  (tests, repo, context, gates duration) and the cooks of another station are not read there.
- **What it does not carry**: nothing here launches `claude` nor reads or writes the log, so neither the
  memory of what a pass left (a candidate left may be proposed again), nor the start condition on the
  cooks in flight, nor the `closing.*` facts, nor the summary.

### What this path does not do

- **The summary holds nothing back**: a pass PR in which a guardrail gave way under green gates is
  judged green and merged under the `merge` grant like any green delivery. The reviewer remains its
  judge.
- **Only the last finished pass has its summary**; the earlier ones stay in the log.
- **A pass's zone is released as soon as its PR is open**, not at its merge.
- **A stopped or escalated pass PR does not appear in "what awaits the chef"**: it reads in `brigade
  <projet> pass`, and on the PR.
- **The measures' counter "merges since the last closing"** (`mergesSinceCleanup`) does not yet restart
  from a pass; the automatic trigger counts its own, which does.
- `brigade <projet> guardrails` calls `manager` any cook with no ticket; the closer is recognised there
  by its run, `fermeture-…`.
