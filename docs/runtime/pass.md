## The pass

When a cook has delivered, **the pass judges its delivery with no one involved**. Three judges, in
this order:

1. **The gates**: `.claude/brigade/gates.sh <worktree>`, played in a **throwaway worktree where the
   delivered commit is merged with the base of the moment**. **The exit code is the verdict.** The
   project's `.claude/brigade/worktree-setup.sh` runs first, and what it exports holds for them.
   Cap, setup included: 30 minutes (`BRIGADE_GATES_TIMEOUT_SECONDS`), then red.
2. **The reviewer**, only if the gates are green: a `claude` that rereads the diff.
3. **The CI** of the judged commit (*check runs* and statuses), read only if the gates are green.

| What the CI says | What the pass does with it |
|---|---|
| a failing job, the branch **up to date with the base** | **red**, with the job's name, its conclusion, its address, and the failing tests with their error lines, read from the job's log by the pass (`echecsDuJournal`; the link alone when the log names no test or cannot be read) — unless the red is not the delivery's (below) |
| a red job **that has never been green on the base** (no green run of that job among the last ten commits of the base) | **reported, not judged** (`pass.ci-excused`): the delivery is judged without it — no rerun, no send-back, no card. A comment on the issue names the job and says it has not been green on the base; the ticket's history says it too. Once the base has a green run of the job, its red is judged like any other job's. Another red job, green on the base, still judges the delivery |
| failing jobs, the branch up to date with the base, **only on tests the delivery does not touch** — and nothing else is red (gates, reviewer) | **the failed jobs are rerun, once per delivery** (`pass.ci-rerun`): no verdict, no send-back, no card, no comment. The CI is awaited again — the old red of a rerun job counts as running, and the CI wait restarts from the rerun. Green, the delivery goes on to the merge; red on another test, it is a verdict as above; red again on the same test, see the next row |
| failing jobs **red again after that rerun, on the same tests** the delivery does not touch — the base green, nothing else red | the test is unstable, and neither the ticket nor the chef has anything to do with it. **Each test goes to the kitchen as a `fix` ticket** (`runtime/src/test-instable.ts`): labels `fire`, `fix`, `prio:1`, `model:sonnet`, `effort:medium`, a body that names the test, the delivery, the jobs before and after the rerun, and the marker `<!-- brigade:test-instable <test> -->`. One ticket per test: the last one the pass opened for it is reused while it is open (`reused`). Its opening is announced first (`pass.test-fix-opening`): an answer lost on the way, it is found again by its marker instead of being opened twice; GitHub down, the pass comes back at the tick, with no verdict. Then **those jobs are set aside** (`pass.ci-set-aside`) and the delivery is judged without them: the CI reads `green` if nothing else is red, its red checks kept in the verdict. A comment on the issue says so (« Pass — CI mise de côté : test instable »). No send-back, no escalation, no card |
| a failing job **a red verdict of this ticket already judged** — the same job, the same run: the cook sent back pushed nothing that reran it — and nothing else red (reviewer) | **a send-back never judges the same CI run twice**: the failed jobs are rerun first (`pass.ci-rerun`, `alreadyJudged`), whatever they say — no attribution needed. The next verdict reads the rerun. A job GitHub cannot rerun (not an Actions job, a refused rerun) stays a verdict |
| a failing job, the branch **without the head of the base** | that CI did not judge what will be merged: **its red is not a verdict**. The cook is sent back with "bring yourself up to date with the base", the jobs named — not with "CI red". It uses up a send-back, like a conflict. In the log, the CI is "not read" (`skipped`), its checks kept |
| jobs still running | no verdict: read again at each tick. Thirty minutes with no conclusion: escalated (`unjudged`, cause `ci-silent`), and the kitchen takes it up. Unless the reviewer has a blocking finding: red right away, CI "not read" |
| everything green | green — whether or not the branch has the head of the base: the merge is judged by the gates |
| **no check at all** | neither green nor red: the verdict rests on the gates and the reviewer (`ci: none`). Unless the branch carries a workflow (`.github/workflows`) that triggers on PRs to the base (`pull_request` or `pull_request_target`, branch and path filters included): its checks are awaited. A workflow that only runs on push, on a schedule, on a tag or by hand holds nothing back: the PR is judged without CI. The workflows are read from the judged branch at each judgment, never kept: deleting the last PR workflow takes effect on the next one. While it waits, the pass logs the file it waits for (`pass.ci-awaited`), `pass` and `status` name it, and so does the `ci-silent` escalation |

**A CI red that is not the delivery's** (`runtime/src/relance-de-ci.ts`). It is established only
when every failing job is a GitHub Actions job whose log names its failing tests (the summary of
`node --test`: `test at <file>:<line>:<col>`), each test is found once in the repository, and none
is touched by the change: the test is not modified, no changed file is in what it imports or names
— itself or its helpers under its test directory, product code being a leaf, type-only imports not
counted —, and the change touches nothing that rules whole suites (a `package.json`, a lockfile, a
`tsconfig`, `.github/`, `.claude/brigade/`). Anything that cannot be established — a status that is
not an Actions job, an unreadable log, a log that names no test (a type check, a lint, a job cut at
its timeout), a test the change touches — leaves the red to the delivery, as before. The rerun
needs the right to rerun jobs: under role identities, the pass's token carries no `actions`
permission (`identites-et-secrets.md`), GitHub refuses it, the runtime says so in its log, and the
red stays a verdict.

The comments the pass leaves on the issue write the CI as « non lue » (French) for `skipped`. That
word stays French until the runtime is translated.

The verdict is in the log (`pass.judged`) **with what produced it** and **what it covers**: the
head of the branch (`sha`), that of the merged base (`base`), the resulting tree (`merged`).
**Green means "once merged with the base, the gates and the CI found nothing, and a reviewer reread
the diff and found nothing blocking".** Not "a human reread it", and never "green on its own
branch". The CI's "nothing" leaves out the jobs set aside for an unstable test the delivery does
not touch: that red belongs to a `fix` ticket of the kitchen, named in `pass.ci-set-aside`.

A delivery can reach it **off the rail**: the PR of a closing pass, or that of a correction to the
instructions that you accepted ("Proposed corrections"), or that of the lessons notebook
([`carnet-lecons.md`](carnet-lecons.md)), which have no ticket.
It goes through the same judges and the same grant; what belongs to the ticket — the send-back to a
cook, the serving, the closing of the issue — does not happen (see "The PR goes through the pass" in [`fermeture.md`](fermeture.md)).

### The gates' duration cap is not judged by the pass

Gates can set themselves a duration cap (the **Plafond des gates** binding in the project's
`CLAUDE.md`) and exit red when it is exceeded. It measures the workstation where it was set, and a
cook can do nothing about it: **the pass does not judge it.** It recognizes it by two lines —
`durée des gates : … pour un plafond de <n> s — … de trop` and `FAIL  plafond des gates franchi : plus de <n> s de processeur`.
Those two lines, and the name of the binding, are written by the gates and read by the runtime in
French: they stay French until the runtime is translated.

| The gates exit red, and | What the pass does with it |
|---|---|
| the cap is their **only** `FAIL` line | **green**: the delivery goes on its way. The overrun is read in the log (`gates.overCeiling`), on the issue (« Pass — plafond des gates franchi, non jugé »), in `pass` and in `measures` |
| another `FAIL` line is there | **red**. The send-back names the other failures, and says there is nothing to fix for the cap |

The comment on the issue is written by the runtime in French, and stays so until it is translated.

The rule also holds for the base check. **It assumes that no red from `gates.sh` is silent**: gates
that are red for another reason **with no `FAIL` line** are seen as green when they cross their
cap. It is up to the project to hold that — exit at the first failure (`set -e`), cap last; or one
`FAIL` line per failure, crash included — or to remove the binding. A cap line without its
measurement, or an output of more than 256 kB, leaves the gates red.

**Every run of the gates the pass plays — a delivery's or the base's — writes what it cost**:
`gates.ran`, its wall-clock time and its CPU, children included, read against the project's gates
budget. A run over budget, with no budget ticket of the project open, makes the pass open one on
the project, on its own — one at a time. See "The cost of the gates, and its budget" in
[`etat-et-mesures.md`](etat-et-mesures.md).

**The same gates are not played twice on the same code** (`runtime/src/empreinte-des-gates.ts`).
Each `gates.ran` carries the fingerprint of what it judged: `tree`, the exact code tree — for a
delivery, the tree of its merge with the base; for a cook, its worktree as it was when the gates
left, uncommitted work included — and `config`, a digest of the gates configuration: the gates
script, the worktree setup and the secrets declaration (`.claude/brigade/secrets`), each read in the
worktree where the gates run, a link followed to what it points to. Before playing a delivery's
gates, the pass looks for **the ticket's** latest run with the same fingerprint — another ticket's
run never counts, even on the same tree: two deliveries that give the same code are two deliveries:

| That run | What the pass does |
|---|---|
| **green** — the cook's, typically: it passed them on what it delivers, and the base has not moved since its branch left it | **reuses it**: no gate command is launched, no saturation is measured. The verdict's `gates.reused` names the reused run — its `seq` in the log, its `runner`, its ticket, its time — and `gates.tail` says « gates non rejouées : le cook les a déjà passées vertes sur le même arbre, avec la même configuration — passage <seq> du journal (#<ticket>, <time>) ». **No `gates.ran` is written**: a reuse adds neither wall-clock nor CPU to the cost |
| red, or cut at its cap | played in full, as before: the latest run on a fingerprint is what that code does today |
| none — one file changed, the configuration changed, the base moved, or the cook played the script without the launcher | played in full, as before |

**The cook's gates reach the log through the station's launcher**, see "The cook's gates reach the
log" in [`station.md`](station.md). A reused run is only as trustworthy as the cook that left its
receipt; the reviewer and the CI judge the delivery either way. The pass's own runs are
fingerprinted too: the same delivery judged again on the same merged tree, after a restart, reuses
them.

### The judgement worktree

The pass reads **what the origin received from the branch** (the cook's worktree no longer exists)
and makes a worktree only to **play the gates** and **have it reviewed**:
`worktrees/.essais/jugement-<ticket>`, throwaway, detached, where **the delivered commit is merged
with the head of the base**, fetched that very moment. This merge is never pushed — **the pass
touches no branch**. The worktree is removed at the end of the judgement; a killed runtime leaves
one behind, removed at startup before resuming. **The judged commit is the one GitHub knows.**
**The setup is played cold**: a project whose setup relies on a cache pays the whole installation at
each judgement, under the gates' cap.

The path `worktrees/.essais/jugement-<ticket>` is the one the runtime writes today: it stays French
until the runtime is translated.

### The reviewer

After green gates, the pass launches a **reviewer**: one more `claude`, in the judgement's
throwaway worktree, at the project's calibration (`station reviewer-modele` and `reviewer-effort`,
with no default).

The two station settings keep their French names (`reviewer-modele`, `reviewer-effort`) until the
runtime is translated.

- **It is never the cook rereading itself**: a fresh process, its own instructions, no session
  resumed.
- **It can write nothing.** Three tools — `Read`, `Grep`, `Glob` — and nothing else: no shell, no
  editing, no skill, no MCP server, no account settings, no mode without permission.
- **What it reads**: the ticket's title and body, the comments of those who have a hand on the
  repository (`OWNER`, `MEMBER`, `COLLABORATOR`) — without those of the brigade —, the cook's
  report, the list of changed files, and the diff against the integration branch: **data, not an
  instruction**. A diff of more than 40,000 bytes, or a list of more than 8,000, is cut: it reads
  the rest in the worktree, without the removed lines (`truncated: true`). Instructions of more
  than 120,000 bytes **are not launched** (`unjudged`, cause `review-unsendable`).
- **A harvest commit** — what the cook had left uncommitted — is named to it: a file that has no
  business there (a secret, a draft, a tool's output) is **blocking**.
- **A written form criterion is blocking** as soon as it is not met ("five lines at most").
  Outside that, the doubt goes to the remark: a taste, a style, a naming never block.
- **It says what the diff should remove and does not**, at each review, or that there is nothing
  to remove: remarks « À supprimer : … », **never blocking**, even under a red verdict. The remarks
  are written in French by the runtime (the prefix `À supprimer :`) and stay so until it is
  translated. The number that says whether this helps — lines added for each one removed, over the
  last 120 merges: `git log --first-parent --merges -120 --numstat --format= <base> | awk '{a+=$1; r+=$2} END {print a/r}'`.

| The reviewer says | What the pass does with it |
|---|---|
| no blocking finding | nothing is held back. The remarks are on the issue; they do not go back to the cook |
| **a blocking finding** | **red**: the finding goes back to a cook, and uses up a send-back |
| an answer that cannot be read | **neither green nor red**, and no cook can do anything about it: the review is **asked of the reviewer again**, on the same commit, **twice at most**, without launching a cook. Once readable, it is judged like any other; unreadable three times, the delivery is escalated (`unjudged`, cause `review-unreadable`), with no send-back and no merge |

Each review leaves a « Reviewer — … » comment on the issue. **A delivery that was read is not read
again** (`pass.reviewed`): only an unreadable review is asked again, and the log then carries
several `pass.reviewed` on the same `sha`; a send-back is another delivery. **A green reviewer
lifts no other rule**: neither the stop without a grant, nor `review-required`.

A review is in the log **like a cook** (station `reviewer`, run `review-<ticket>-…`) and goes
through the guardrails: **nothing is reviewed** under "stop", with the breaker open, the quota
exhausted or the connection expired — the delivery waits, and so does its re-ask. If it does not
complete, it is **a failure** for the breaker, and retried; unreadable, it is one only if it leaves
the delivery unjudged — asked again, it counts neither for nor against; **refused by the model**, it
is retried without counting, then escalated at the third refusal in a row (`unjudged`, cause
`review-refused`; see "When the model refuses", a heading of [`station-cook.md`](station-cook.md)).
It does not hold the station back.

### The second judge

A green delivery that touches **its judges** — `.claude/brigade/` (gates, setup, pass settings) or
`.github/workflows/` — is stopped (`review-required`, cause `judge-modified`), then **judged a
second time**, only once per delivery, by a judge **independent of the reviewer**:

- **another run**, in the log under the station `second-judge` (run `second-judge-<ticket>-…`),
  which reads **neither the review nor the verdict** of the reviewer;
- **stronger than it**: `opus`, and the effort one notch above the reviewer's (`max` at most). A
  reviewer already at `opus` / `max` has no one above it: the second judge is not launched, and the
  verdict is `cannot establish`;
- **a single question**: is the check weakened — a test removed or softened, a guard bypassed, a
  threshold relaxed, a verification skipped? The same reading tools as the reviewer, in a throwaway
  worktree where the delivery is merged with the base of its verdict.

It answers `not weakened`, `weakened` or `cannot establish`, with its reason — when in doubt,
`cannot establish`. An answer that cannot be read, or a refusal by the model, counts as
`cannot establish`. Whatever its verdict, it also says **what the delivery changes in its judges,
for the chef's card** (`change`): a few plain English words that follow "it" — `runs the Windows
tests on v2 too`, `skips 5 Windows-only flaky tests, listed in #1850` —, with no code and no file
name. It is optional: without it, the verdict still reads. The verdict is in the log
(`pass.second-judged`: its run, its calibration, the reviewer's and the run of its review, the
verdict, the reason, the change) and **as a comment on the PR**
(« Second juge — … », written in French by the runtime until it is translated). Then:

- **`not weakened`**: the delivery goes back to the path of an ordinary delivery — under the
  `merge` grant, the pass merges it itself (`grant.used`, `merge.done`), with no card; with no
  grant, it stops at `no-grant`, like any other;
- **`weakened` or `cannot establish`**: it stays stopped, and a **`gesture` card** is placed before
  the chef (`todo.entered`, author `pass`), written with the verdict. It says in three lines what
  is weakened (the second judge's reason), where (the files of its judges, with their lines, and
  the PR), and the gesture expected: reread the PR, merge it by hand to accept what it changes to
  its judges, or close it. The issue comment shows these three lines; the card, which the TODO
  check takes on a single line only, carries them end to end. It leaves TODO when the chef decides:
  PR merged (ticket served) or closed.

**The merge card of a delivery to review** (#1877). A green delivery stopped at `review-required`
reaches the chef only once it is reviewed from end to end, and only if the kitchen has nothing left
to do with it (`runtime/src/attend.ts`). It stays in the kitchen, out of `attend`:

- while it touches its judges and its second judge has not judged it — this delivery, its run and
  its commit;
- when the second judge established it `not weakened` and it touches no declaration: the pass takes
  it back as an ordinary delivery;
- while the second judge's `gesture` card waits for the triage, which reads it first: it relaunches
  the cook, or lets the card through. Once the triage let it through — or with no triage, when the
  TODO gate refuses it at once —, the delivery awaits the chef: nothing is hidden from them for lack
  of a decision.

A delivery whose review found something blocking never gets there: its verdict is red, and it goes
back to a cook. The card says, in two plain sentences, what the delivery changes and what its review
found — "The delivery of #1859 changes how deliveries are checked: it runs the Windows tests on v2
too. Its review found nothing blocking, but it loosens a check, which only you can accept." What it
changes is the second judge's `change`, if it reads as plain words; otherwise, fixed words name
what it touches (the CI, the gates, the hosts its cooks may reach, the secrets they receive, the
project settings). It has **one button, "Merge"** — the merge is the chef's gesture, never the
pass's —, besides "ask the second" and the free answer.

The verdict holds for the delivery — its run, its commit: judged again by the pass because the base
moved, it does not go before the second judge again. A delivery that also touches `reseau` or
`secrets` stays stopped whatever the verdict (below); its card is placed the same way. Like a
review, it does not leave under "stop", with the breaker open, the quota exhausted or the
connection expired; if it does not complete, it leaves again at the next wake-up.

### Tickets with no diff

An audit, an analysis: the cook concludes without committing anything, and **what it delimited in
its last message is the deliverable** (see "The deliverable is delimited", a heading of
[`station-cook.md`](station-cook.md)). **The reviewer is then the only judge,
and it is mandatory**: it rereads the delimited deliverable — that alone — against the ticket.

| The reviewer says | What happens |
|---|---|
| nothing blocking | the ticket is **served without a merge** (`pass.served`) and its issue closed — **with no grant**. The deliverable stays on the issue, in the cook's comment |
| a blocking finding | red: it goes back to a cook, on the same branch, within the limit of two send-backs |
| unreadable | asked of the reviewer again, twice at most; still unreadable, escalated (`unjudged`, cause `review-unreadable`), and the kitchen takes it up |
| nothing — "stop", breaker, quota, connection | the ticket **waits in pass** |

A cook with no commit **and** no delimited deliverable has delivered nothing — `no-commit` if it
said nothing or wrote files without committing them (they are committed on its local branch),
`no-deliverable` if it delimited nothing: a station failure, send-back not used up. Known limit: a
cook that concludes without committing on a ticket that asked for code goes to the pass as "with no
diff" — it is up to the reviewer to say so.

### What the pass decides

| Verdict | `merge` grant | What happens |
|---|---|---|
| green | **active** | the runtime checks that **the base is still the one of the verdict** — otherwise it judges again —, then **merges the PR itself**; the ticket is **served**, its issue closed |
| green | absent, revoked or off | the PR stays open and **the pass stops there** (`pass.held`, `no-grant`) |
| green, but the delivery touches `.claude/brigade/` or `.github/workflows/` — its judges | no matter | **not merged on the pass's verdict alone** (`review-required`, cause `judge-modified`): a cook that modifies its judges can turn itself green. It goes before **the second judge** (above): `not weakened`, it follows the line of an ordinary green delivery, grant included; otherwise, it stays stopped and a `gesture` card is placed before the chef |
| green, but the delivery touches `.claude/brigade/reseau` or `.claude/brigade/secrets` — addition, change or removal | no matter | **never merged by the pass** (`review-required`, cause `declaration-modified: <files>`): once merged, the declaration opens a host, or hands over a secret of the machine, to the next cooks. The issue comment says what to reread in it |
| green, ticket with no diff | no matter | **served without a merge**, issue closed |
| none, **base red** | no matter | the delivery **waits** (`pass.waiting`, `base-red`) and leaves again by itself when the base is repaired — or replayed green (`base -- replay`). Only the repair ticket for that red is judged and merged despite it |
| red — gates on the merge, conflict, CI, or blocking finding | — | the **findings go back to a cook**, on the same branch. Nothing is merged |
| red a second time, **manager on** | — | the pass **hands over to the manager** (`pass.deferred`; see "It reacts to a failure") |
| red a third time, manager off | — | two send-backs are used up: the pass **escalates the ticket to you** (`still-red`). It goes **86** |

The files `.claude/brigade/reseau` and `.claude/brigade/secrets` keep their French names until the
runtime is translated.

Only a red verdict uses up a send-back. A send-back cook that fails without delivering anything
uses none: it is the breaker that bounds. Each decision is commented on the issue, and says what
the verdict covered — `` `8c1d2e0` merged with `v2` (`4be1f07`) ``. The words of those comments
(« Pass — rouge, renvoi n/2 », « Pass — en attente (`motif`) ») are written in French by the
runtime and stay so until it is translated.

#### A send-back's cook resumes the previous one's session

A send-back does not start from zero: the send-back's cook **resumes the conversation of the cook
whose delivery the pass refused** — what it read of the ticket, of the `CLAUDE.md` and of the code,
what it did — and receives in addition only **the refusal and what the pass found**. Without
resuming, a fresh cook reread everything for a correction of a few lines.

| Step | What the station does |
|---|---|
| the session | it reads it in the previous cook's raw stream (`runs/<run>.jsonl`, the `session_id` of `stream-json`) |
| the transcript | it looks for it under `projects/` in `claude`'s configuration directory — `<state>/claude` under partition, otherwise the account's `CLAUDE_CONFIG_DIR` or `~/.claude` —, and copies it into the project directory of the send-back's **fresh worktree**: that is where `claude --resume` looks for it |
| the launch | `claude --resume <session> --fork-session`: the session is forked, the send-back's cook writes its own under a fresh identifier, and the previous one's stays as it is |
| the instructions | the refusal (« le renvoi n sur 2 »), the findings, and the fresh worktree — the old one no longer exists, its paths are reread under the new one. Neither the ticket nor the `CLAUDE.md` to reread: they are in the conversation |
| in the log | `cook.launched` carries `resumes`: the resumed run and its session |

The refusal line « le renvoi n sur 2 » is written in French by the runtime and stays so until it is
translated.

**The pass changes nothing for it.** Its delivery goes through the same gates, on the same merge
with the base, the same CI, the same review, the same grant as a first pass — nothing is skipped,
nothing is softened. Resuming only saves the reading.

**The fallback: a fresh cook, as before.** The send-back starts from zero, with the full
instructions (reread the ticket, the `CLAUDE.md`, what is committed), and writes nothing else,
when:

- the last cook launched on the ticket **did not deliver** — a resumed send-back cook that fails
  may have stumbled on the resuming itself: the next one starts from zero;
- its raw stream is gone, or says **no session**;
- its **transcript is no longer there** — tidied past the retention period ("The project's
  transcripts are tidied"), or never written;
- `claude`'s configuration directory is not known (neither partition, nor `CLAUDE_CONFIG_DIR`, nor
  `HOME`), or the worktree path is too long for `claude` to find the session there;
- it is a **manager relaunch**, decided when the send-backs are used up: it starts from a fresh
  look;
- it is a **remote station**: the transcript is on its workstation, not on the box.

The measures report says which launches were resumed ("The measures reading").

#### The reasons, and the gesture for each

One reason per chef gesture — no more names than gestures. What qualifies a reason without
changing the gesture is its `cause`; `pass` shows both, `(unjudged : ci-silent)`, and the queue in
`status` writes the gesture on each line.

| Fact | Reason | What it is | Your gesture |
|---|---|---|---|
| `pass.held` | `no-grant` | green, no active grant (`expired`: it had lapsed on its own at that moment) | merge the PR by hand; or, for the next ones, `npm --prefix runtime run grant -- enable merge` |
| `pass.held` | `review-required` | green, but it touches its judges (cause `judge-modified`) or what the project opens up to itself (cause `declaration-modified: <files>`). No grant makes it merge | reread it, then merge it by hand |
| `pass.held` | `merge-refused` | green, and GitHub refused the merge (cause: what it said). Not retried | lift what it refuses, then merge by hand |
| `pass.escalated` | `still-red` | red, and its send-backs will not fix it: send-backs used up (cause `returns-exhausted`), the manager escalates (cause `manager-escalated`), or it is the PR of a closing pass, off the rail, which no one picks up (cause `off-rail`) | none: the kitchen takes it up (below) — except the manager's escalation with a card, which is the card's question, and the off-rail PR: merge it by hand, or close it |
| `pass.escalated` | `unjudged` | the pass could not judge; the cause says what prevented it | none: the kitchen takes it up (below) — except `secrets-unavailable`: set the secrets, then remove and put back `fire`; or merge by hand; or remove `fire` |
| `pass.escalated` | `manager-split` | the manager cut the ticket up again: its sub-tickets carry the work | none |

The causes of an `unjudged` — none uses up a send-back of the pass:

| Cause | What prevented the judgement |
|---|---|
| `wrong-base` | the PR does not target the integration branch (a PR to `main` when the base is `v2`) |
| `no-gates` | the project has no `gates.sh` once the branch is merged: without gates, "green" would mean no one looked |
| `worktree-lost` | the station's clone no longer knows the branch, or the merge fails without being a conflict (git down). The pass does not recreate the branch; what the cook pushed stays on the origin |
| `ci-silent` | thirty minutes of CI with no conclusion |
| `review-unreadable`, `review-unsendable`, `review-refused` | the review cannot be read, asked twice more of the reviewer; its instructions do not fit in a command; the model refused it three times in a row |
| `unstable-test: <test>` | written only before #1820, when the CI of the delivery was red a second time, after the single rerun of its failed jobs, on the same test the change does not touch; the card read « base unstable: delivery red on a test this change does not touch, twice (`<test>`) ». Such a red now goes to the kitchen as a `fix` ticket and the delivery is judged without it (above): it never becomes a chef's card. A log from before still reads this way |
| `secrets-unavailable` | the gates could not receive the project's secrets, and were not played (see "The project's secrets") |

An escalated ticket goes **86**, rail reason `pass:still-red` or `pass:unjudged`. A log from before
this grouping can still be read: the old name (`judge-modified`, `ci-silent`…) becomes the cause.

#### A technical escalation goes to the kitchen, not to the chef (#1826)

The chef's queue holds only a product choice or a gesture only the chef can make. A delivery
still red, or one the pass could not judge, is neither: it never enters `awaiting`. The pass takes
it up itself, at the wake that follows the escalation (`runtime/src/remontee-a-la-cuisine.ts`):

1. **send-back** — an `unjudged` delivery goes back **once** to a cook, on its branch, with what
   prevented the judgement, using up none of the pass's send-backs (`pass.kitchen-took-over`
   `return`, then `pass.returned` with `kitchen: true`). Not for a cause the cook cannot lift:
   `wrong-base` (the station opens the PR), `no-gates` (a cook must not write its own judge),
   `review-unsendable` (the reviewer's instructions are the runtime's) — those go straight to 2;
2. **`fix` ticket** — still red, or unjudged again, the kitchen opens a `fix` ticket on the cause
   (`sonnet` / `medium`, `prio:1`, as for an unstable test; its body carries
   `<!-- brigade:remontee <n> -->`, so that a lost GitHub answer finds it again instead of opening
   a second one). The ticket stays 86 on the rail, waiting for it (`fix`);
3. **resume** — once that `fix` ticket leaves the rail (served, or removed), the delivery goes back
   to a cook (`resume`), again with no send-back used up;
4. **raise** (#1861) — sent back and `fix` already tried, or the ticket is itself a correction the
   kitchen opened: it is never left set aside. The kitchen raises its calibration one notch on the
   issue — effort first, then model — within the project's ceiling and **never above `high`**
   (`raise`, with `from` and `to`); once the rail reads it, the delivery goes back to a cook
   (`resume`), using up no send-back. Escalated again, it climbs one more notch;
5. **retry** (#1902) — about to drop it, the kitchen first sends the delivery back **once** more to
   a cook, from the current base, if at least one merge landed on the base (`merge.done`) after the
   ticket's last red verdict: what failed it may have changed (`retry`, with `merges`, then
   `pass.returned` with `kitchen: true`; comment « Cuisine — un essai de plus depuis la base du
   moment, avant l'abandon »). Once per ticket, like the send-back and the `fix`; a ticket never
   judged red, or with no merge since, is not retried;
6. **drop** — nothing left to raise, or a cause no cook lifts (`SANS_RENVOI`, its `fix` tried): the
   kitchen posts the reason on the issue (« Cuisine — ticket abandonné »), then removes `fire`
   (`drop`, with its `reason`). The issue stays open; putting `fire` back brings the ticket back.
   Every ticket that awaits it, step by step, leaves the rail with it, with the same reason and a
   comment naming it, and follows it back when `fire` returns to it (see "A ticket can wait for another" in
   [`journal-et-rail.md`](journal-et-rail.md)).

A `none` ("nothing more") written before #1861 is not final: the kitchen takes that escalation up
again. A ticket in WAITING, or set aside for a capability no station provides, keeps its wait.

At each step, the ticket's line on the rail (`status`, and the app's card) says what the kitchen
does with it — "the kitchen takes it up (ci-silent), not the chef", "its `fix` ticket #501 is open,
and it goes back to a cook once #501 is served", "raised its calibration … from sonnet / low to
sonnet / medium: it goes back to a cook once the rail reads it" — never a gesture for the chef.
Merging the PR by hand, or removing `fire`, still works as before.

Only `secrets-unavailable` (the secret values are the chef's to set, no cook may see them), the
manager's escalation with a card (the card is the product question), the off-rail PR of a closing
pass (no ticket) and the abandoned code rename (its own failure line speaks for it) stay out of the
kitchen. `CAUSES_DU_CHEF` and `QUI_ATTEND` (`runtime/src/attend.ts`) list what may still enter the
chef's queue and why; `runtime/test/remontee-a-la-cuisine.test.ts` reads every escalation cause the
runtime writes and fails on one nobody classified.

**Without a grant, the stop comment says what the pass would have done** — « Sous grant, la pass
aurait mergé <PR> sur `<base>` au commit `<sha>`, verdict n° <n> — une fois vérifié que `<base>`
n'a pas bougé depuis ce verdict et n'est pas rouge. » (written in French by the runtime until it is
translated) —, without fetching or playing anything. And **the figure on which to grant** is read
in `pass`, `grant` and — as long as the queue is not empty — the `awaiting` block of `status`, in
the log alone: `without a grant, 3 green deliveries stopped: 1 merged by hand, 1 closed without
merge — 1 disagreement —, 1 still open` (`pass`, `grant` and `status` say it in English). The count
follows the stopped delivery, by its PR. Closing the PR without merging it is the disagreement —
reopened then merged, it is merged. A delivery that the pass merged itself, the grant having been
given since, is counted apart (`merged by the pass`): it is not your gesture. `review-required` and
`merge-refused` do not count in it.

#### Getting a stopped or escalated ticket out

**Merge its PR by hand**: the pass rereads GitHub at each tick, sees it, serves the ticket and
closes the issue. Or **remove `fire`**: it leaves the rail.

**Closing a PR without merging it is refusing the delivery**: at the next tick the pass writes it
(`pass.pr-closed`), says it once on the issue, and no longer judges, sends back or merges anything
on it (`PR CLOSED WITHOUT MERGE` in `pass`). **The ticket does not move**: it keeps its place — and
its zone — on the rail; remove `fire` or close the issue to take it out. Reopened then merged, the
pass sees it; reopened without being merged, it is not judged again.

**When a ticket leaves the rail under the pass** — issue closed or `fire` removed, delivery not
merged —, the pass **lets go of the delivery**: review stopped, no cook relaunched. It closes
**neither the PR nor the branch**; with the PR still open, it says so **once** (`pass.abandoned`,
and on the issue, with where the judgement stood): **it is up to you to merge or close it**. Put
back on the rail, the ticket starts again from the base, without that PR. **If you had merged the
PR before the ticket left**, it is not an abandonment: the merge is noted (`merge.done`,
`by: outside`), the ticket **served** for whoever awaited it, the base checked.

### Green means green once merged

**A delivery is judged on the merge of its branch with the base of the moment — always.** At each
judgement, the pass fetches the base, merges the delivered commit with its head in the throwaway
worktree, and plays the gates there.

| What happens | What the pass does |
|---|---|
| **the merge fails** (conflict) | neither gates nor review. The cook is sent back with a single instruction — **"bring yourself up to date with the base"** (`git fetch`, rebase, resolve). It uses up a send-back |
| gates red on the merge, **and the base is red on its own** | that red is no cook's: **neither verdict nor send-back**, the delivery waits (`base-red`) |
| gates red on the merge, the base green on its own | **red**: it is up to the cook. The finding says on which merge the gates were played |
| **the base moved between the verdict and the merge** | the delivery is **judged again**, merged with the base it has become: gates replayed, reviewer and CI not (they cover the commit). The new verdict is what authorizes the merge. A delivery that awaits its CI first concludes on the base where it started |
| the merge fails without a conflict (git down) | no cook is sent back: escalated (`unjudged`, cause `worktree-lost`), with what git said about it |
| gates red on the merge, and **the base cannot be played on its own** | "could not check" is not "it is green": neither verdict nor send-back, the judgement stays in progress until the base is judged — or moves |

The instruction sent to the cook is written by the runtime as « Mets-toi à jour de la base : `git
fetch origin <base>`, puis rebase ta branche sur `origin/<base>` » : French until the runtime is
translated.

Judging again costs no cook, but **it consumes the machine**: when it is saturated (the thresholds
of "Several cooks at once"), the delivery to judge again **waits** (`pass.waiting`,
`machine-saturated`) and leaves again by itself.

#### Gates cut by their clock guard on a saturated machine are not a red

On a saturated machine, a healthy suite can take longer than the gates' clock guard leaves it: cut,
it is red **without any test having failed**. This red comes from the load, not from the code.
Counting it as a real red would send the ticket back to one cook, then another, then to the
manager, and could turn the base red. **The pass recognizes it by a line** of `gates.sh`: a `FAIL`
line that contains `garde d'horloge, aucun test en échec`. This repository's:
`FAIL  tests du runtime arrêtés par la garde d'horloge, aucun test en échec : plus de 300 s sans
rendre la main`. With a test failing before the cut, `gates.sh` writes another line, and it is a
red as before. **The pass takes the cut for a load red only if that line is the only `FAIL` line**
(`gates.clockGuardCut`), and the output was kept whole.

That `FAIL` line is written by the gates in French, and the runtime reads it in French: it stays so
until the runtime is translated.

| The gates are cut with no failing test, and | What the pass does |
|---|---|
| the machine is **saturated** (thresholds of "Several cooks at once"), at the start of the gates or at the end | **it is not a red**: no verdict, no send-back to the cook, the base is not judged, nothing counts for the breaker. The delivery **waits** (`pass.waiting`, `gates-cut-saturated`, with the `sha`) and its gates **are replayed alone** as soon as the machine is no longer saturated |
| they **already were once** on this commit, then replayed on a calm machine | **red**: it is no longer the load, it is a stuck test or a suite that has become too slow. The send-back says so |
| the machine is **calm** | **red**, from the first time, for the same reason |

**The queue and the card say it in one line** while waiting: `gates replayed later: machine
saturated, no test failing`. It is read at the end of the ticket's line in the rail of `status`, in
the activity of `facts` (`rail[].activite.fait`, whose text is the French `gates rejouées plus tard :
machine saturée, aucun test en échec`), so on the app's card, and in `pass`. The issue gets a
comment (« Pass — en attente (`gates-cut-saturated`) ») with the gates line and the load measured,
and journald a line. The comment and the `activite.fait` text stay French until the runtime is
translated.

**The rule holds for the base judged on its own.** Its gates only leave on a calm machine. If they
are cut with no failing test and the machine is saturated at the end, **no check is written**: the
base is not seen red, and journald says so. What required the check (a merge to verify, a replay, a
red delivery) asks for it again, and it is replayed by itself once the machine is calm. Cut again on
this head, its gates turn it red. This memory of the base does not survive a runtime restart: it
grants it one more replay at most.

#### The base is judged alone

The gates are played **on the base itself**, in a throwaway worktree, **off any ticket** (the setup
receives the number `0`), and the result written to the log (`base.checked`): after **a merge made
outside the runtime** (`merge.done`, `unverified`); before **a delivery that is red once merged**,
if the base was not judged on this head; and **as long as it is red**, as soon as it moves — or on
your request. A merge made by the pass triggers none.

**Red** is said in journald, in `status` without being asked (`base  RED since …`, with the gesture
that makes it replay), at the top of `pass`, and on each ticket whose merge was to be verified.
**Nothing is judged or merged any more** — each delivery **waits** (`base-red`), with no verdict or
send-back — and **the station stops taking tickets** (`station.held`, reason `base`), send-back
cooks included. The cooks in progress continue; the manager's judgements and the reviews too.

**The kitchen deals with the red on its own.** The pass **first replays its gates once**, at once
and with no commit (`base.recheck-requested`, written by `pass`): a passing red — a flaky test, an
exceeded delay — thus falls with nothing opened. **If the red holds** — a second check played
confirms it, replay or base that moved —, it **opens a repair ticket** on GitHub
(`base.repair-opening` then `base.repair-opened`, under its number): its title and body name the
base, the commit and what fails (the gates' `FAIL` lines, and the end of their output). It carries
`fire`, `model:opus`, `effort:high` and **`prio:0`, which goes ahead of the whole rail**. **It is
the only ticket that leaves from a red base**: the station that can take it is not held back by it,
and takes only that; the pass judges it merged with the red base, and merges it under grant — its
green gates say it repairs it. Merged, the base moves, its gates are replayed, and at green
everything restarts by itself. **Only one at a time**: no second is opened while the first is in
progress, nor more than one per red. A creation whose answer is lost is found again by the marker
on its issue (`<!-- brigade:reparation-base <sha> -->`), not created again. The repair reads
`en-cours`, `servie` or `echouee` (part of the rail with no serving, escalated to the chef, or base
still red after its merge) — `reparationDeLaBase`, which the queue and the card read. **As long as
it is working, the red base does not enter the `awaiting` block**: nothing awaits you. **Failed, it
enters it**, on a `base` line ("What awaits the chef", in [`etat-et-mesures.md`](etat-et-mesures.md)),
and **leaves it by itself on return to green** — the kitchen, for its part, restarts with no
gesture.

The marker, the three repair states and the function name are the runtime's own identifiers, still
French: they stay so until the runtime is translated.

You can always push the fix yourself, or merge a waiting delivery by hand.

**A red that is not about the code is also replayed with no commit on your request**:
`npm --prefix runtime run base` says what the last check said,
`npm --prefix runtime run base -- replay` has the gates of a red base replayed on the same head
(`base.recheck-requested`, read at once by the running pass). **Green**, the hold falls; **red**,
it stays. With the machine saturated, the replay waits (`base.recheck-held`).

**A red base is also re-checked on its own when main moves past it**: the pass replays the gates
on the new head, once per head, with no gesture. **Green**, the hold falls and `status` and `base`
say the base was re-checked on that head, after the base moved past the red one; **red**, the hold
stays and they say it is still red on the new head. A base that has not moved is not re-checked.

**A base that cannot be fetched holds its check** (origin unreachable, token refused): neither red
nor a check not played. The pass writes it and says it **once per cause** (`base.check-held`), then
retries at the tick; `status`, `pass` and `base` say the current reason and since when. **A red
that was seen stays red**, your request stays due. Once the fetch is back (`base.check-resumed`),
the due check is played at once.

**"I could not check" is not "it is green".** A check **not played** (`outcome: skipped`) — no
gates, or **the attempt did not happen** (the throwaway worktree cannot be created; `reason`: what
git said about it) — holds nothing back on a base never seen red, and **leaves a base seen red as
red** (`red`: the commit of the red that remains). Only a check **played and green** lifts the red.
A check not played is not retried at each tick, and it **closes** a requested replay: `status`,
`pass` and `base` show the reason — **repairing the repository is up to you**, then
`base -- replay`.
