## The observing closing

The measures say what the project **weighs**; the observing closing says what it **has not removed**.
`npm --prefix runtime run closing` (`brigade <project> closing` on the box) reads the integration
branch of the project's clone — `origin/<BRIGADE_BASE_BRANCH>` in `BRIGADE_REPO_DIR`, as the last
fetch left it — and prints three things:

| Block | What it says | How it is counted |
|---|---|---|
| `ratio` | The lines added and removed (`+added / −removed`) and their ratio, over the latest 20, 50 and 100 merges | The merge commits of the branch, each against its **first parent**: what the merge brought to it. A commit put straight on the branch is not a merge; what a branch wrote and then removed before its merge does not count |
| `duplicates` | Each run of at least 8 identical lines of code in two places, with its two passages (`path:start-end`), the longest first | Text compared with text, in the code files: neither indentation, nor blank lines, nor comments, nor lines of pure punctuation count. A third copy is given once, against the first |
| `dead code` | Each named export of a TypeScript or JavaScript file that nothing else names (`path:line`) — or that only tests name, and which ones | A name searched in every file of the branch, docs excepted. An export that its own file reuses, or that another file writes, is alive |

- **It modifies nothing.** No file, no branch, no PR, no fact in the log, and it does not fetch: it
  only plays `git` commands that read, without taking a lock — not even the index's. It therefore
  answers while the cooks work and the pass merges, and holds back neither.
- **It spots, it does not judge.** Two identical passages are not always to be merged, and an export
  that a framework reads by convention is named by no one. Conversely, two dead exports that carry
  the same name keep each other alive. These are candidates, to be read.
- **When there is nothing, it says so**: `none spotted`, and among how many files it searched. A
  branch of fewer than 20 merges gives its ratio over the ones it has, and says so. A file of more
  than 1 MB is not read, and the output counts the ones it set aside.
- The `log` block takes up the counters of the measures — the merges since the last closing, the
  thresholds crossed — when `BRIGADE_STATE_DIR` carries a log; without it, the repository is
  observed all the same. Two variables are required: `BRIGADE_REPO_DIR` and `BRIGADE_BASE_BRANCH`.
  Its `pass` line says where the last writing pass stands — requested and what holds it, withdrawn,
  refused, tidying up, or how it ended — as soon as one has been requested (see "The writing
  closing"), and the **summary** of the last one that finished follows it (see "The summary of a
  pass").

### The same reading, for the app

`npm --prefix runtime run closing -- --json` (`brigade <project> closing --json`) gives the same
reading as **one JSON object, on one line**: it is what the app reads of a project's closer, without
parsing any text. It launches nothing: the log is opened read-only, the repository is only read by
the observation, and no request is ever written. Three variables: `BRIGADE_STATE_DIR`,
`BRIGADE_REPO_DIR`, `BRIGADE_BASE_BRANCH`; without a log, it exits with 1 — nothing then says whether
the closer is set.

| Field | What it carries |
|---|---|
| `configured` | Is the closer set (`closing.configured` in the log)? False: the object carries only `text`, which says so — no observation, no finding, no request |
| `closer` | Its calibration and its caps in force |
| `observation` | `mergesSinceCleanup` (the measures' counter), `ratio` (each window: `added`, `removed`, `ratio` — null if nothing is removed —, `reads`), `duplicates`, `deadExports`. `readable` false: the branch cannot be read, `error` says why, the rest of the object can still be read |
| `findings` | Each duplicate and each dead export, under the name the pass gives it (`D1`, `M1`…): `file`, `start`, `end` — a duplicate also says its `copy` |
| `request` | The last request: `none`, `waiting` (`reason`: what holds it, null when nothing does any more; `stalledAt`: with no way out), `running`, `refused` (`reason`), `cancelled`, `done` (`outcome`, `removed`, `pr` — null without a PR —, `kept`); each `reason` carries its code (`code`) and its sentence |
| `drift` | `crossed`: a measure of the record crosses the threshold the chef declared for it — the same one the `log` block above says. No threshold declared: `declared` false, nothing is crossed |

## The writing closing

The observing closing touches nothing; this one **removes**. It is the most dangerous agent in the
system: a cook that gets it wrong adds bad code, and the pass catches it; a closer that gets it
wrong **erases good code**, and the gates will say "it still works", since what disappeared was
tested by nothing. So it leaves only on **your gesture**, under a measured start condition, and
under all the guardrails — everyone's, no others.

```
brigade <project> closing write    # npm --prefix runtime run closing -- write
brigade <project> closing cancel   # npm --prefix runtime run closing -- cancel
```

- **Nothing else launches it.** Not a threshold crossed (`measures` *proposes* it, `drift.crossed`
  launches nothing), not a clock, not a restart: a request that the runtime had not sent off before
  it stopped — whether or not it was waiting — is refused when the runtime comes back (`restarted`,
  said in journald); it has to be requested again.
- **You request it once, it waits.** With too many cooks in flight it is not refused: it waits for
  its start condition and leaves on its own, once, as soon as it is met — nothing to watch, nothing
  to restart (see "The request waits").
- **It is off the rail**: it takes no ticket, has no priority, and its closer leaves under the
  `closer` station, with no ticket.
- **It merges nothing and never pushes onto the integration branch.** What it removes goes onto its
  branch (`cook/fermeture-<8 characters>`) and into **one PR** to the integration branch, which it
  hands to **the pass**: judged and merged like a ticket's, with no path of its own (see "The PR goes
  through the pass").

The branch name `cook/fermeture-<8 characters>` and the run names `fermeture-…` stay French until the runtime is translated.

### The closer is set, or there is none

By the same gesture as the chef's other decisions — `station -- closer-modele <model>`,
`closer-effort <effort>`, `closer-cooks <N>`, `closer-tokens <N>`, `closer-retraits <N>` —,
logged, without `sudo` and without a restart; `remove <gesture>` goes back to the variable. Once
set, the decision wins over the variable of the same name, and holds from the next pass on: the one
that is tidying keeps its caps. `station` shows the decisions set and, below them, the settings in
force. Without a calibration, the project has no writing pass and nothing else changes: the command
refuses, naming the gesture. One without the other, or an unreadable value, makes the start be
**refused**. These values stay in the state directory's log, out of a cook's reach.

The gesture names `closer-modele`, `closer-effort`, `closer-cooks`, `closer-tokens` and `closer-retraits` stay French until the runtime is translated.

| Variable | Default | Role |
|---|---|---|
| `BRIGADE_CLOSING_MODEL`, `BRIGADE_CLOSING_EFFORT` | none | The closer's calibration — it is your quota, it has no default |
| `BRIGADE_CLOSING_COOKS` | 1 | The start condition: the pass leaves when **fewer** cooks than this are in flight. `1`: none |
| `BRIGADE_CLOSING_MAX_TOKENS` | 500,000 | Tokens per pass — in place of a cook's cap, not on top of it. No cap per week |
| `BRIGADE_CLOSING_MAX_REMOVED_LINES` | 500 | Lines a pass may remove |

They are written to the log when they change (`closing.configured`): that is where the command reads them.

### The start condition

A writing pass moves the integration branch under the cooks in flight: "when things calm down" is a
condition, measured in the log. **A cook in flight** is a ticket that a station holds (`taken`), or
whose cook is still running after leaving its hands; the re-reading of a ticket in pass is not one.
The pass leaves when there are **fewer than the threshold** — an empty rail carries none. This
condition is the only door: **the pass never leaves under more cooks in flight than the threshold**,
and nothing that follows loosens it.

The command writes `closing.requested`; the runtime sees it within the second, **rereads the
condition at that moment**, and starts the pass (`closing.started`). What does not pass on its own is
refused (`closing.refused`), by the command — which exits with 1 and launches nothing — as by the
runtime:

| Reason | What is missing |
|---|---|
| `unconfigured` | The closer is not set |
| `busy` | A pass is already tidying up — only one at a time |
| `stopped`, `breaker` | The chef's "stop", the breaker open: "resume" first |
| `depot` | The integration branch cannot be fetched, or cannot be read |
| `nothing` | The observation spots nothing, or nothing outside what the cooks hold |

The reason codes (`depot`…) are the runtime's and stay as they are.

### The request waits

What passes on its own is not refused: the request **waits**, and the runtime rereads it at every
wake-up — every time the log moves, so as soon as a cook hands back, and at every tick.

| Reason | What holds it |
|---|---|
| `cooks` | Too many cooks in flight for the threshold (`observed`, `limit`) |
| `zoneless` | A cook in flight declares no zone: the pass cannot know what it holds, **so it holds everything** |
| `deploying` | A deployment requested was holding the pass — only read in the logs from before the station |

```
closing pass requested on 2026-10-13T14:00:00.000Z, it waits — start condition not met: 2 cooks in flight for a threshold of 2 — the pass leaves when there are fewer than the threshold, or when the rail is empty (it carries 2 unserved tickets); it leaves on its own, once, as soon as nothing holds it back, without anyone restarting it — to withdraw it: `brigade <project> closing cancel`
```

That is the sentence `closing` and `status` print. The line the runtime writes to journald for the
same request stays in French until the runtime is translated.

- **It leaves on its own, once**, at the first wake-up where nothing holds it back — the condition
  being reread in the transaction that writes `closing.started`. Nothing is reserved for it: between
  two cooks, a station can take the next ticket before it, and it waits for the next gap. The
  threshold stays your setting (`station -- closer-cooks <N>`).
- **It reads in the queue** — the `awaiting` block of `status`, under the name `closing`: since when,
  and what holds it at the time of reading (how many cooks in flight, for which threshold). And on the
  `pass` line of `brigade <project> closing`. It leaves the queue by leaving, refused or withdrawn.
- **Only one at a time**: requested again while it waits, nothing is rewritten — the command says
  "already requested", with its time and what holds it, and exits with 0.
- **You withdraw it by the same gesture**, `closing cancel` (`closing.cancelled`), as long as it has
  not left: nothing leaves, even when the condition is met afterwards. The runtime rereads the request
  in the transaction that makes the pass leave: withdrawn while it was fetching the base, it does not
  leave. Once left, it cannot be recalled — "stop" halts it, and nothing is delivered.
- **The "stop" or the breaker while it waits refuse it** (`stopped`, `breaker`): it does not leave
  again by itself on resume.
- **With no way out after two hours.** A request that has waited for **2 h** — twice a cook's default
  duration cap: two whole cooks have followed one another without leaving a gap — is said to have no
  way out, once: `closing.stalled` in the log, with what was holding it; a line in journald; and its
  queue line becomes `CLOSING PASS WITH NO WAY OUT`, with the gestures that unblock it — raise the
  threshold, turn the manager off while the rail empties, or give up. It still waits: saying it has
  no way out does not refuse it, and does not make it leave.

### From the app: the preview, the "yes", the withdrawal

The app requests and withdraws the pass by the same decisions as your two gestures — not by others:
what `closing write` refuses, it does not request. Each answer is a JSON object on one line, with its
`outcome` and its `text` — the sentence the typed command prints.

```
brigade <project> closing preview [--json]          # what a pass costs, what the closer will do — writes nothing
brigade <project> closing write --json --confirm    # the request, once your "yes" is given
brigade <project> closing cancel --json             # withdraws the request that waits
```

- **The preview writes nothing**: no request, no refusal — it opens the log read-only. It says the
  **cost** (`cost`: the closer's calibration and its caps, `null` with no closer set), **what the
  closer will do** (`does`, sentence by sentence), where the request stands (`request`: `none`,
  `waiting` and what holds it, `running` and its run), and **what a request made now would become**
  (`ifRequested`: `leaves`, `waits`, `already-requested`, `refused`, `impossible`, with its reason).
  It does not replay the observation: it says what the station already knows.
- **Nothing leaves without `--confirm`.** A typed command is your "yes"; a program's call is not.
  `write --json` without `--confirm` exits with 1 (`unconfirmed`) without opening the log.
- The exit codes are those of the typed gestures: 0 requested, already requested, withdrawn or
  nothing to withdraw; 1 refused (`refused`, with its `reason` — `unconfigured` with no closer set),
  impossible, or withdrawal of a pass that has left (`refused`, with its `run`); 2 badly written.

### What it proposes, and what it holds

The pass fetches the base and replays **the observation**: its duplicates and its dead exports are
the closer's candidates, each under a short name (`D1`, `M3`…), forty at most. The files of these
candidates — the test or the doc that names a dead export included — are **its zone**, and the rail's
file zones hold in both directions:

- **It does not touch what a cook holds.** A candidate with a single file in the zone of a cook in
  flight, or of a ticket in pass, is not proposed — the PR says so, with the ticket that holds it.
  And it is reread at delivery: a closer that wrote outside its zone, or in what a cook holds — a
  zoneless cook that left in the meantime holds everything — **delivers nothing** (`zone`).
- **No cook starts on what it holds.** While it tidies, the rail counts its zone as that of a ticket
  that is taken: a ticket whose zone overlaps it waits until it has finished, the others leave. This
  is the overlap of two tickets ("File zones"), not another one. A ticket **with no zone** is held by
  nothing, as between two tickets.

### The guardrails

The closer is launched by the guarded launch of all cooks: nothing is rewritten for it.

| Guardrail | What stops it | End of the pass |
|---|---|---|
| Token cap per pass | `guard.tripped` `tokens`, at the pass's limit | `tokens` |
| Removal cap per pass | The lines its worktree removes, committed or not, read at every tick (`guard.tripped` `removals`); and counted again at its end | `removals` |
| Idleness, duration, turns | The caps of every cook ("Setting the caps") | `idle`, `duration`, `turns` |
| "stop" | `brigade <project> guardrails stop` halts it within the second; none leaves before "resume" | `stop` |
| Breaker | Open, none leaves; open while it tidies, it is stopped | `breaker` |

**Stopped, it delivers nothing**: no branch pushed, no PR. What it had written stays committed on its
local branch, like the work of a stopped cook. A closer stopped by a cap, or that wrote what it did
not hold, is **a failure that the breaker counts**. And it says so in three places: `closing.ended`
in the log, a line in `journalctl -u brigade@<project>`, and the `pass` line of the `log` block of
`brigade <project> closing`:

```
pass       fermeture-3f9c1a2e, on 2026-10-13 14:02 — stopped: the closing's token cap reached (512,340 for a cap of 500,000) — nothing is delivered
```

The run name `fermeture-3f9c1a2e` stays French until the runtime is translated; the rest of the line is what the command prints.

### The PR, and what it left

The PR says what was **removed** and everything that was not, **with its reason**:

- **Left for lack of certainty**: for each candidate it does not remove, the closer writes a line
  `LAISSÉ <name> : <why>` — copied as it is. Nothing is held as removed on its word: the pass replays
  the observation on its branch, and a candidate that is still spotted there without the closer having
  named it is said to be **left with no reason**.
- **Set aside before the pass**: what a cook was holding, and what went beyond the forty candidates.

A pass that removed nothing opens no PR: what it left is in `closing.ended` (`kept`).

The `LAISSÉ` keyword is the one the runtime asks of the closer and reads back, and the PR body the closing pass writes is still French; both stay as they are until the runtime is translated.

### The PR goes through the pass

Once its PR is open, the closing pass **hands it to the pass** in the gesture that writes its end
(`closing.ended` `delivered`, then `pass.entered`). Everything that "The pass" says of a delivery
holds for it, not one step less: the pushed commit is merged with the current base in a throwaway
worktree, the project's **gates** are played there, the **reviewer** reads the diff, the commit's
**CI** is read, and green, it is merged only **under the `merge` grant** — `grant.used` before the
call to GitHub, `merge.done` after. Without a grant, it stops green (`no-grant`) and waits for your
merge; a pass that touches its judges or the project's declarations is never merged by the pass
(`review-required`).

What changes comes from a pass having **no ticket**:

- **The pass follows it under the number of its PR** — which GitHub gives to no issue — and it is on
  the PR that it speaks: the reviewer's reading, the verdict, the stop. `brigade <project> pass` shows
  it as `PR #<n>  off the rail (run fermeture-…)`, and `brigade <project> pass <n>` tells its
  judgement. In the log, its facts (`pass.*`, `grant.used`, `merge.done`) carry that number.
- **The reviewer is its real judge**, and its brief is not a ticket's: it looks for what the diff
  removes and something alive still depends on, a test weakened to get a removal through, and what the
  diff does beyond what the PR announces. Green gates prove nothing there — what disappeared may have
  been tested by nothing. **A removal that it cannot establish is safe is blocking**: the opposite of
  a ticket, where doubt is a remark.
- **Red, nobody takes it back**: no cook is sent back, the closer does not leave again, the manager is
  not consulted. From the first red it is escalated (`pass.escalated`, `still-red`: `off-rail`), the
  pass says so on the PR with what it found, and the PR stays open: it is for you to merge it by hand
  — the pass will see it — or to close it, and to start another pass.
- **Merged, or closed without a merge, the pass no longer follows it**: there is no ticket to serve,
  no issue to close. A merge by hand is noted (`merge.done`, `by: outside`), and the gates are
  replayed on the base, as after any merge made outside the runtime.

### The summary of a pass

A pass reads **without reopening its PR**: `brigade <project> closing` gives, under its `pass` line,
the summary of the last pass that finished. It is reread from the log alone — nothing is replayed —
and its verdict comes first, on one line:

```
pass       fermeture-3f9c1a2e, on 2026-10-13 14:02 — delivered: 1 line removed in 1 file, 2 candidates left for lack of certainty — …
summary    FAILURE — gate checks : down (12 → 11), even if the gates are green — the pass may have removed live code · the slope falls (10:1 → 6.7:1 over 20 merges)
           PR #101 — judged green by the pass, merged on 2026-10-13 14:20
removed    1 of 3 candidates · 1 line removed, none added, in `src/libre/outils.ts`
           M1  export `inutile` of `src/libre/outils.ts:2` — referenced nowhere
left       2, for lack of certainty
           D1  8 identical lines of code: `src/libre/a.ts:1-8` = `src/libre/b.ts:1-8`  two modules that evolve apart
           M2  export `oublie` of `src/tenu/outils.ts:2` — referenced nowhere           the closer gave no reason — the candidate is still spotted after the pass
slope      added / removed over the same merges: before the pass → with what it removes
           20 merges   +20 / −2  10:1  →  +20 / −3  6.7:1  falls — only 2 merges on the branch
           …
guardrails before the pass → after, by the gates the pass ran: on the base `01913d7`, then on the PR merged with it
           test coverage      87.5 % → 87.5 %              holds
           gate checks        12 → 11                      FAILURE — down
           product state      gates green → gates green    holds
```

| Block | What it says | Where it comes from |
|---|---|---|
| `removed` | Each candidate removed, with its path and what the observation proposed it for; the lines removed and added, the files written | `closing.ended`: `removed`, `removedLines`, `addedLines`, `files` |
| `left`, `set aside` | Each candidate the closer left, with its reason — or that it left without saying it; and what was set aside before it left | `closing.ended`: `kept` |
| `slope` | The added / removed ratio of the latest 20, 50 and 100 merges of the base the pass left from, **before** and **with what it removes** — over the same merges: what moves is due to it alone | `closing.ended`: `slope`, read at the pass's start |
| `guardrails` | Three, each with its value before, after, and its verdict | The gates the pass played — see below |

- **The symptoms trigger, the effects make the summary** — and a reduction is not measured without
  measuring what it must not break. Three guardrails: the **test coverage** has not gone down
  (`MESURE couverture`), the gates **still check as many things** (`MESURE verifications`), the
  **product works** (the PR's gates are green). The first two are what the project declares through its
  gates ("What the gates declare"): the runtime does not invent them.
- **A drop is a failure, said first — even under green gates.** A closer that erases live code and
  the test that covered it leaves green gates: that is the case the summary exists to say. Any drop
  in coverage or in the number of checks is a `FAILURE`, however small; gates that are red or stopped
  at their duration cap are the product's failure.
- **"Before" and "after" differ only by what the pass wrote.** "After": the gates of the last
  judgement of its PR (`pass.judged`), merged with the current base. "Before": the gates played **on
  the very tree of that base** — its check alone (`base.checked`), or the judgement of the delivery
  whose merge made it. A delivery merged between the pass's start and the judgement of its PR is
  therefore in both measures, and hides nothing.
- **A guardrail that nothing measured is `not established`, never held**, and the head of the summary
  counts it: the PR not yet judged, gates that do not declare the measure, a base on whose tree no
  gate in the log was played (a commit put straight on it, for example). The summary says which.
- **If the slope has not moved, it writes it: "the pass was of no use".** It is the figure of the
  20-merge window, as it reads — `24.3:1` before, `24.3:1` after, did not move. The same if it rises,
  and for a pass that removed nothing or delivered nothing. As long as its PR is not merged, the base's
  slope has not moved at all: the summary says where the PR stands.
- **No cap per week**: it is this summary, pass after pass, that will say whether one is needed.

The measure names `MESURE couverture` and `MESURE verifications` are lines the gates print, and the runtime still reads them in French; they stay as they are until the runtime is translated.

### What this path does not do

- **The summary holds nothing back**: it is read. A pass PR in which a guardrail gave way under green
  gates is judged green by the pass, and merged under the `merge` grant like any green delivery;
  nothing warns you outside `brigade <project> closing`. The reviewer remains its judge.
- **Only the last finished pass has its summary** in `brigade <project> closing`; the earlier ones
  stay in the log (`closing.ended`, and the `pass.judged` of their PR).
- **A pass's zone is released as soon as its PR is open**, not at its merge: as long as the PR is in
  pass, a cook can start on the files it modifies. The pass judges each delivery merged with the
  current base: the second to merge is judged again, and a conflict shows there.
- **A pass PR that is stopped or escalated does not appear in "what awaits the chef"** of
  `brigade <project> station`: it reads in `brigade <project> pass`, and on the PR.
- **In `journalctl`, the pass still says "ticket #<n>"** for a pass's PR on most of its lines: the
  number is the right one, the word is not.
- **The counter "merges since the last closing"** of the measures does not yet restart from a pass.
- `brigade <project> guardrails` calls `manager` any cook with no ticket: the closer is recognised
  there by its run, `fermeture-…`.
