## The pass

When a cook has delivered, **the pass judges its delivery with nobody involved**. Three judges, in
this order:

1. **The gates**: `.claude/brigade/gates.sh <worktree>`, run in a **disposable worktree where the
   delivered commit is merged with the base of the moment**. **The exit code is the verdict.** The
   project's `.claude/brigade/worktree-setup.sh` runs first, and what it exports holds for the
   gates. Cap, setup included: 30 minutes (`BRIGADE_GATES_TIMEOUT_SECONDS`), then red.
2. **The reviewer**, only if the gates are green: a `claude` that rereads the diff.
3. **The CI** of the judged commit (*check runs* and statuses), read only if the gates are green.

| The CI says | What the pass does with it |
|---|---|
| a failing job, the branch **up to date with the base** | **red**, with the job's name, its conclusion, its address |
| a failing job, the branch **without the head of the base** | that CI did not judge what will be merged: **its red is not a verdict**. The cook is sent back with "update yourself from the base", the jobs named — not with "CI red". It uses up a return, like a conflict. In the log, CI "not read" (`skipped`), its checks kept |
| jobs still running | no verdict: reread at every tick. Thirty minutes without a conclusion: escalated to the chef (`unjudged`, cause `ci-silent`). Except for a blocking finding from the reviewer: red right away, CI "not read" |
| everything green | green — whether or not the branch has the head of the base: the merge is judged by the gates |
| **no check** | neither green nor red: the verdict rests on the gates and the reviewer (`ci: none`). Unless the branch carries a workflow (`.github/workflows`) that triggers on PRs to the base (`pull_request` or `pull_request_target`, branch and path filters included): its checks are awaited. A workflow that only runs on push holds nothing back: the PR is judged without CI |

The verdict is in the log (`pass.judged`) **with what produced it** and **what it covers**: the
head of the branch (`sha`), that of the merged base (`base`), the resulting tree (`merged`).
**Green means "once merged with the base, the gates and the CI found nothing, and a reviewer reread
the diff and found nothing blocking".** Not "a human reread it", and never "green on its branch".

A delivery can reach it **off the rail**: the PR of a closing pass, or that of a correction to the
instructions that you accepted ("The proposed corrections"), or that of the lessons notebook
([`carnet-lecons.md`](carnet-lecons.md)), which have no ticket.
It goes through the same judges and the same grant; what belongs to the ticket — the return to a
cook, serving, closing the issue — does not happen (see "The PR goes through the pass").

### The gates' duration cap is not judged by the pass

Gates can give themselves a duration cap (binding **Gates cap** in the project's `CLAUDE.md`) and
exit red when it is crossed. It measures the workstation where it was set, and a cook can do
nothing about it: **the pass does not judge it.** It recognizes it by two lines — `durée des gates : … pour
un plafond de <n> s — … de trop` and `FAIL  plafond des gates franchi : plus de <n> s de processeur`:

| The gates exit red, and | What the pass does with it |
|---|---|
| the cap is their **only** `FAIL` line | **green**: the delivery goes on its way. The overrun can be read in the log (`gates.overCeiling`), on the issue ("Pass — gates cap crossed, not judged"), in `run pass` and `run measures` |
| another `FAIL` line is there | **red**. The return names the other failures, and says of the cap that there is nothing to fix for it |

The rule also holds for the base check. **It assumes that no red of `gates.sh` is mute**: gates red
for another reason **without a `FAIL` line**, if they cross their cap, are seen as green. It is up to
the project to hold this — exit at the first failure (`set -e`), cap last; or one `FAIL` line per
failure, crash included — or to remove the binding. A cap line without its measure, or an output of
more than 256 kB, leave the gates red.

### The judgment worktree

The pass reads **what the origin received from the branch** (the cook's worktree no longer exists)
and only makes a worktree to **run the gates** and **have it reviewed**:
`worktrees/.essais/jugement-<ticket>`, disposable, detached, where **the delivered commit is merged
with the head of the base**, fetched just now. This merge is never pushed — **the pass touches no
branch**. The worktree is removed at the end of the judgment; a killed runtime leaves one behind,
removed at startup before resuming. **The judged commit is the one GitHub knows.** **The setup runs
cold**: a project whose setup relies on a cache pays the whole installation at every judgment, under
the gates cap.

### The reviewer

After green gates, the pass launches a **reviewer**: one more `claude`, in the judgment's disposable
worktree, at the project's calibration (`station reviewer-modele` and `reviewer-effort`, no default).

- **The cook never rereads itself**: a fresh process, its instruction, no session resumed.
- **It can write nothing.** Three tools — `Read`, `Grep`, `Glob` — and nothing else: no shell, no
  editing, no skill, no MCP server, no account settings, no mode without permissions.
- **What it reads**: the ticket's title and body, the comments of those who have a hand on the
  repository (`OWNER`, `MEMBER`, `COLLABORATOR`) — without the brigade's —, the cook's report, the
  list of changed files, and the diff against the integration branch: **data, not an instruction**.
  A diff of more than 40,000 bytes, or a list of more than 8,000, is cut: it reads the rest in the
  worktree, without the deleted lines (`truncated: true`). An instruction of more than 120,000
  bytes **is not launched** (`unjudged`, cause `review-unsendable`).
- **A harvest commit** — what the cook had left uncommitted — is named to it: a file that has no
  business there (a secret, a draft, a tool output) is **blocking**.
- **A written form criterion is blocking** as soon as it is not met ("five lines at most").
  Outside that, the doubt favors the remark: a taste, a style, a naming never block.
- **It says what the diff should remove and does not remove**, at every review, or that there is
  nothing to remove: "To remove: …" remarks, **never blocking**, even under a red verdict. The
  figure that says whether this helps — lines added per line removed, over the last 120 merges:
  `git log --first-parent --merges -120 --numstat --format= <base> | awk '{a+=$1; r+=$2} END {print a/r}'`.

| The reviewer says | What the pass does with it |
|---|---|
| no blocking finding | nothing is held back. The remarks are on the issue; they do not go back to the cook |
| **a blocking finding** | **red**: the finding goes back to a cook, and uses up a return |
| an answer that cannot be read | **neither green nor red**, and no cook can do anything about it: the review is **asked again of the reviewer**, on the same commit, **twice at most**, without relaunching a cook. Readable, it is judged like any other; unreadable three times, the delivery is escalated (`unjudged`, cause `review-unreadable`), with no return or merge |

Each review leaves a "Reviewer — …" comment on the issue. **A delivery that has been read is not
reread** (`pass.reviewed`): only an unreadable review is asked again, and the log then carries
several `pass.reviewed` on the same `sha`; a return is another delivery. **A green reviewer lifts no
other rule**: neither the stop without a grant, nor `review-required`.

A review is in the log **like a cook** (station `reviewer`, run `review-<ticket>-…`) and goes
through the guardrails: **nothing is reviewed** under "stop", breaker open, quota exhausted or
connection expired — the delivery waits, and so does its re-asking. Not completed, it is **a failure**
for the breaker, and retried; unreadable, it is one only if it leaves the delivery unjudged —
asked again, it counts neither for nor against; **refused by the model**, it is retried without
counting, then escalated at the third refusal in a row (`unjudged`, cause `review-refused`; see
"When the model refuses"). It does not withhold the station.

### The second judge

A green delivery that touches **its judges** — `.claude/brigade/` (gates, setup, pass settings) or
`.github/workflows/` — is stopped (`review-required`, cause `judge-modified`), then **judged a second
time**, once per delivery, by a judge **independent of the reviewer**:

- **another run**, in the log under station `second-judge` (run `second-judge-<ticket>-…`), which
  reads **neither the review nor the verdict** of the reviewer;
- **stronger than it**: `opus`, and the effort one notch above the reviewer's (`max` at most). A
  reviewer already at `opus` / `max` has nobody above: the second judge is not launched, and the
  verdict is `cannot establish`;
- **a single question**: is the control weakened — test removed or loosened, guard bypassed,
  threshold relaxed, check skipped? The same reading tools as the reviewer, in a disposable worktree
  where the delivery is merged with the base of its verdict.

It answers `not weakened`, `weakened` or `cannot establish`, with its reason — when in doubt,
`cannot establish`. An answer that cannot be read, or a refusal by the model, counts as `cannot
establish`. The verdict is in the log (`pass.second-judged`: its run, its calibration, the
reviewer's and the run of its review, the verdict, the reason) and **as a comment on the PR**
("Second judge — …"). Then:

- **`not weakened`**: the delivery goes back to the path of an ordinary delivery — under the `merge`
  grant, the pass merges it itself (`grant.used`, `merge.done`), with no card; without a grant, it
  stops `no-grant`, like any other;
- **`weakened` or `cannot establish`**: it stays stopped, and a **`gesture` card** is put before the
  chef (`todo.entered`, author `pass`), written with the verdict. It says in three lines what is
  weakened (the second judge's reason), where (the files of its judges, with their lines, and the
  PR), and the expected action: reread the PR, merge it by hand to accept what it changes in its
  judges, or close it. The issue's comment shows these three lines; the card, which the TODO door
  takes on only one line, carries them end to end. It leaves TODO when the chef decides: PR merged
  (ticket served) or closed.

The verdict holds for the delivery — its run, its commit: rejudged by the pass because the base
moved, it does not go before the second judge again. A delivery that also touches `reseau` or
`secrets` stays stopped whatever the verdict (below); its card is put the same way. Like a review,
it does not go out under "stop", breaker open, quota exhausted or connection expired; not completed,
it goes out again at the next wake-up.

### Tickets without a diff

An audit, an analysis: the cook concludes without committing anything, and **what it delimited in
its last message is the deliverable** (see "The deliverable is delimited"). **The reviewer is then
the only judge, and it is mandatory**: it rereads the delimited deliverable — that alone — against
the ticket.

| The reviewer says | What happens |
|---|---|
| nothing blocking | the ticket is **served without a merge** (`pass.served`) and its issue closed — **without a grant**. The deliverable stays on the issue, in the cook's comment |
| a blocking finding | red: it goes back to a cook, on the same branch, within the limit of the two returns |
| unreadable | asked again of the reviewer, twice at most; still unreadable, escalated to the chef (`unjudged`, cause `review-unreadable`) |
| nothing — "stop", breaker, quota, connection | the ticket **waits in pass** |

A cook with no commit **and** no delimited deliverable has delivered nothing — `no-commit` if it said
nothing or wrote files without committing them (they are committed on its local branch),
`no-deliverable` if it delimited nothing: a station failure, return not used up. Known limit: a cook
that concludes without committing on a ticket that asked for code goes to pass as "without a diff" —
it is up to the reviewer to say so.

### What the pass decides

| Verdict | `merge` grant | What happens |
|---|---|---|
| green | **active** | the runtime checks that **the base is still the one of the verdict** — otherwise it rejudges —, then **merges the PR itself**; the ticket is **served**, its issue closed |
| green | absent, revoked or off | the PR stays open and **the pass stops there** (`pass.held`, `no-grant`) |
| green, but the delivery touches `.claude/brigade/` or `.github/workflows/` — its judges | does not matter | **not merged on the pass's verdict alone** (`review-required`, cause `judge-modified`): a cook that modifies its judges can make itself green on its own. It goes before **the second judge** (above): `not weakened`, it follows the line of an ordinary green delivery, grant included; otherwise, it stays stopped and a `gesture` card is put before the chef |
| green, but the delivery touches `.claude/brigade/reseau` or `.claude/brigade/secrets` — addition, modification or deletion | does not matter | **never merged by the pass** (`review-required`, cause `declaration-modified: <files>`): merged, the declaration opens a host, or hands a machine secret, to the following cooks. The issue comment says what to reread in it |
| green, ticket without a diff | does not matter | **served without a merge**, issue closed |
| none, **base red** | does not matter | the delivery **waits** (`pass.waiting`, `base-red`) and starts again on its own when the base is repaired — or replayed green (`run base -- replay`). Only the repair ticket for that red is judged and merged in spite of it |
| red — gates on the merge, conflict, CI, or blocking finding | — | the **findings go back to a cook**, on the same branch. Nothing is merged |
| red a second time, **manager on** | — | the pass **hands over to the manager** (`pass.deferred`; see "It reacts to a failure") |
| red a third time, manager off | — | two returns are used up: the pass **escalates the ticket to you** (`still-red`). It goes **86** |

Only a red verdict uses up a return. A return cook that fails without delivering anything does not
use one up: it is the breaker that bounds. Each decision is commented on the issue, and says what
the verdict covered — `` `8c1d2e0` merged with `v2` (`4be1f07`) ``.

#### A return's cook resumes the previous one's session

A return does not start from zero: the return's cook **resumes the conversation of the cook whose
delivery the pass refused** — what it read of the ticket, the `CLAUDE.md` and the code, what it did
— and receives in addition only **the refusal and what the pass found**. Without resumption, a fresh
cook reread everything for a fix of a few lines.

| Step | What the station does |
|---|---|
| the session | it reads it in the previous cook's raw stream (`runs/<run>.jsonl`, the `session_id` of `stream-json`) |
| the transcript | it looks for it under `projects/` of `claude`'s configuration directory — `<state>/claude` under partition, `CLAUDE_CONFIG_DIR` or the account's `~/.claude` otherwise —, and copies it into the project directory of the return's **fresh worktree**: that is where `claude --resume` looks for it |
| the launch | `claude --resume <session> --fork-session`: the session is forked, the return's cook writes its own under a fresh identifier, and the previous one's stays as it is |
| the instruction | the refusal (`return n of 2`), the findings, and the fresh worktree — the old one no longer exists, its paths are reread under the new one. Neither the ticket nor the `CLAUDE.md` to reread: they are in the conversation |
| in the log | `cook.launched` carries `resumes`: the resumed run and its session |

**The pass changes nothing for it.** Its delivery goes through the same gates, on the same merge
with the base, the same CI, the same review, the same grant as a first pass — nothing is skipped,
nothing is loosened. The resumption only saves the reading.

**The fallback: a fresh cook, as before.** The return starts from zero, with the full instruction
(reread the ticket, the `CLAUDE.md`, what is committed), and writes nothing else, when:

- the last cook launched on the ticket **did not deliver** — a resumed return cook that fails may
  have stumbled on the resumption itself: the next one starts from zero;
- its raw stream is gone, or says **no session**;
- its **transcript is no longer there** — tidied past the retention period ("The project's
  transcripts are tidied"), or never written;
- `claude`'s configuration directory is not known (no partition, no `CLAUDE_CONFIG_DIR`, no
  `HOME`), or the worktree's path is too long for `claude` to find the session there;
- it is a **manager relaunch**, decided when the returns are used up: it starts from fresh eyes;
- it is a **remote station**: the transcript is on its workstation, not on the box.

The measures report says which launches were resumed ("The measures report").

#### The reasons, and the action for each

One reason per chef action — no more names than actions. What refines a reason without changing the
action is its `cause`; `run pass` shows both, `(unjudged : ci-silent)`, and the queue in `status`
writes the action on each line.

| Fact | Reason | What it is | Your action |
|---|---|---|---|
| `pass.held` | `no-grant` | green, no active grant (`expired`: it had lapsed on its own at that moment) | merge the PR by hand; or, for the following ones, `npm --prefix runtime run grant -- enable merge` |
| `pass.held` | `review-required` | green, but it touches its judges (cause `judge-modified`) or what the project opens up to itself (cause `declaration-modified: <files>`). No grant makes it merge | reread it, then merge it by hand |
| `pass.held` | `merge-refused` | green, and GitHub refused the merge (cause: what it said). Not retried | lift what it refuses, then merge by hand |
| `pass.escalated` | `still-red` | red, and nobody will fix it any more: returns used up (cause `returns-exhausted`), the manager escalates (cause `manager-escalated`), or it is the PR of a closing pass, off the rail, that nobody picks up (cause `off-rail`) | decide: merge the PR by hand, or remove `fire` — without a PR, remove `fire` or close the issue |
| `pass.escalated` | `unjudged` | the pass could not judge; the cause says what prevented it | lift what the issue says, then remove and put back `fire`; or merge by hand; or remove `fire` |
| `pass.escalated` | `manager-split` | the manager split the ticket again: its sub-tickets carry the work | none |

The causes of an `unjudged` — none uses up a return, a cook can do nothing about it:

| Cause | What prevented the judgment |
|---|---|
| `wrong-base` | the PR does not target the integration branch (a PR to `main` when the base is `v2`) |
| `no-gates` | the project has no `gates.sh` once the branch is merged: without gates, "green" would mean nobody looked |
| `worktree-lost` | the station's clone no longer knows the branch, or the merge fails without being a conflict (git down). The pass does not recreate the branch; what the cook pushed stays on the origin |
| `ci-silent` | thirty minutes of CI without a conclusion |
| `review-unreadable`, `review-unsendable`, `review-refused` | the review cannot be read, asked again twice of the reviewer; its instruction does not fit in a command; the model refused it three times in a row |
| `secrets-unavailable` | the gates could not receive the project's secrets, and were not run (see "The project's secrets") |

An escalated ticket goes **86**, rail reason `pass:still-red` or `pass:unjudged`. A log from before
this regrouping can still be read: the old name (`judge-modified`, `ci-silent`…) becomes the cause.

**Without a grant, the stop comment says what the pass would have done** — "Under a grant, the pass
would have merged <PR> on `<base>` at commit `<sha>`, verdict no. <n> — once checked that `<base>`
has not moved since that verdict and is not red." —, without fetching or running anything. And **the
figure on which to enable the grant** can be read in `run pass`, `run grant` and — as long as the
queue is not empty — the `awaiting` block of `status`, from the log alone: `without a grant, 3 green deliveries
stopped: 1 merged by hand, 1 closed without merge — 1 disagreement —, 1 still open` (`run pass`, `run grant`
and `status` say it in English). The count
follows the stopped delivery, by its PR. Closing the PR without merging it is the disagreement —
reopened then merged, it is merged. A delivery that the pass merged itself, the grant having been
enabled since, is counted apart (`merged by the pass`): it is not your action. `review-required` and
`merge-refused` do not count there.

#### Getting a stopped or escalated ticket out

**Merge its PR by hand**: the pass rereads GitHub at every tick, sees it, serves the ticket and
closes the issue. Or **remove `fire`**: it leaves the rail.

**Closing a PR without merging it is refusing the delivery**: at the next tick the pass writes it
(`pass.pr-closed`), says so once on the issue, and judges, returns or merges nothing more on it
(`PR CLOSED WITHOUT MERGE` in `run pass`). **The ticket does not move**: it keeps its place — and its
zone — on the rail; remove `fire` or close the issue to take it off. Reopened then merged, the pass
sees it; reopened without being merged, it is not rejudged.

**When a ticket leaves the rail under the pass** — issue closed or `fire` removed, delivery not
merged —, the pass **lets go of the delivery**: review stopped, no cook relaunched. It closes
**neither the PR nor the branch**; PR still open, it says so **once** (`pass.abandoned`, and on the
issue, with where the judgment stood): **it is up to you to merge or close it**. Put back on the
rail, the ticket starts again from the base, without that PR. **If you had merged the PR before the
ticket left**, it is not an abandonment: the merge is noted (`merge.done`, `by: outside`), the ticket
**served** for whoever was waiting for it, the base checked.

### Green means green once merged

**A delivery is judged on the merge of its branch with the base of the moment — always.** At each
judgment, the pass fetches the base, merges the delivered commit with its head in the disposable
worktree, and runs the gates there.

| What happens | What the pass does |
|---|---|
| **the merge does not go through** (conflict) | neither gates nor review. The cook is sent back with a single instruction — **"update yourself from the base"** (`git fetch`, rebase, resolve). It uses up a return |
| gates red on the merge, **and the base is red alone** | that red is no cook's: **neither verdict nor return**, the delivery waits (`base-red`) |
| gates red on the merge, the base green alone | **red**: it is the cook's. The finding says on which merge the gates were run |
| **the base moved between the verdict and the merge** | the delivery is **rejudged**, merged with the base it has become: gates replayed, reviewer and CI not (they cover the commit). It is the new verdict that authorizes the merge. A delivery waiting for its CI first concludes on the base where it started |
| the merge fails without a conflict (git down) | no cook is sent back: escalated (`unjudged`, cause `worktree-lost`), with what git said about it |
| gates red on the merge, and **the base cannot be run alone** | "could not check" is not "it's green": neither verdict nor return, the judgment stays in progress until the base is judged — or moves |

Rejudging costs no cook, but **consumes the machine**: saturated (the thresholds of "Several cooks
at once"), the delivery to rejudge **waits** (`pass.waiting`, `machine-saturated`) and starts again
on its own.

#### Gates cut by their clock guard on a saturated machine are not a red

On a saturated machine, a healthy suite can take longer than the gates' clock guard leaves it: cut,
it is red **without any test having failed**. That red comes from the load, not the code. Counting
it as a real red would send the ticket back to a cook, then to another, then to the manager, and
could turn the base red. **The pass recognizes it by one line** of `gates.sh`: a `FAIL` line that
contains `garde d'horloge, aucun test en échec`. This repository's:
`FAIL  tests du runtime arrêtés par la garde d'horloge, aucun test en échec : plus de 300 s sans
rendre la main`. With a failing test before the cut, `gates.sh` writes another line, and it is a red
as before. **The pass takes the cut for a load red only if that line is the only `FAIL` line**
(`gates.clockGuardCut`), and the output was kept whole.

| The gates are cut with no failing test, and | What the pass does |
|---|---|
| the machine is **saturated** (thresholds of "Several cooks at once"), at the start of the gates or at the end | **it is not a red**: no verdict, no return to the cook, the base is not judged, nothing counts for the breaker. The delivery **waits** (`pass.waiting`, `gates-cut-saturated`, with the `sha`) and its gates **are replayed on their own** as soon as the machine is no longer saturated |
| they **already were once** on this commit, then replayed on a calm machine | **red**: it is no longer the load, it is a blocked test or a suite that has become too slow. The return says so |
| the machine is **calm** | **red**, the first time, for the same reason |

**The queue and the card say it in one line** while waiting: `gates rejouées plus tard :
machine saturée, aucun test en échec`. It is read at the end of the ticket's line in the rail of
`run status`, in the activity of `facts` (`rail[].activite.fait`), hence on the app's card, and
in `run pass`. The issue gets a comment ("Pass — waiting (`gates-cut-saturated`)")
with the gates line and the load recorded, and journald a line.

**The rule holds for the base judged alone.** Its gates only start on a calm machine. If they are
cut with no failing test and the machine is saturated at the end, **no check is written**: the base
is not seen as red, and journald says so. What needed the check (a merge to verify, a replay, a red
delivery) asks for it again, and it replays on its own once the machine is calm. Cut again on that
head, its gates turn it red. This memory of the base does not survive a runtime restart: it grants
it at most one more replay.

#### The base is judged alone

The gates are run **on the base itself**, in a disposable worktree, **outside any ticket** (the
setup receives the number `0` there), and the result written to the log (`base.checked`): after **a
merge made outside the runtime** (`merge.done`, `unverified`); in front of **a delivery that is red
once merged**, if the base was not judged on that head; and **as long as it is red**, as soon as it
moves — or at your request. A merge made by the pass triggers none.

**Red**, it is said in journald, in `run status` without being asked (`base  RED since …`, with the
action that makes it replay), at the top of `run pass`, and on each ticket whose merge was to be
verified. **Nothing is judged or merged any more** — each delivery **waits** (`base-red`), with no
verdict or return — and **the station stops taking tickets** (`station.held`, reason `base`), return
cooks included. Cooks in progress continue; the manager's judgments and the reviews too.

**The kitchen deals with the red on its own.** The pass **first replays its gates once**, at once and
without a commit (`base.recheck-requested`, written by `pass`): a passing red — an unstable test, a
timeout — thus falls away without opening anything. **If the red holds** — a second check, run
as a replay or because the base moved, notes it —, it **opens a repair ticket** on GitHub
(`base.repair-opening` then `base.repair-opened`, under its number): its title and body name the
base, the commit and what fails (the gates' `FAIL` lines, and the end of their output). It carries
`fire`, `model:opus`, `effort:high` and **`prio:0`, which goes ahead of the whole rail**. **It is the
only ticket that starts from a red base**: the station that can take it is not withheld by the red,
and takes only it; the pass judges it merged with the red base, and merges it under a grant — its
green gates say that it repairs it. Merged, the base moves, its gates are replayed, and at green
everything starts again on its own. **One at a time**: no second is opened while the first is in
progress, nor more than one per red. A creation whose response is lost is found again by its issue's
mark (`<!-- brigade:reparation-base <sha> -->`), not recreated. The repair reads
`en-cours`, `servie` or `echouee` (part of the rail without serving, escalated to the chef, or base
still red after its merge) — `reparationDeLaBase`, which the queue and the card read. **As long as it
is working, the red base does not enter the `awaiting` block**: nothing awaits you. **Failed, it
enters it**, on a `base` line ("What awaits the chef", below), and **leaves it on its own when green
returns** — the kitchen, for its part, starts again without any action.

You can always push the fix yourself, or merge a waiting delivery by hand.

**A red that is not due to the code can also be replayed without a commit at your request**:
`npm --prefix runtime run base` says what the last check said,
`npm --prefix runtime run base -- replay` has the gates of a red base replayed on the same head
(`base.recheck-requested`, read at once by the running pass). **Green**, the hold falls; **red**, it
stays. Machine saturated, the replay waits (`base.recheck-held`).

**A base that cannot be fetched holds back its check** (origin unreachable, token refused): neither
red nor an unrun check. The pass writes it and says so **once per cause** (`base.check-held`), then
retries at the tick; `run status`, `run pass` and `run base` say the current reason and since when.
**A red that was noted stays red**, your request remains due. Once the fetch is back
(`base.check-resumed`), the due check is run at once.

**"I could not check" is not "it's green".** A check that was **not run**
(`outcome: skipped`) — no gates, or **the attempt did not happen** (the disposable worktree cannot
be created; `reason`: what git said) — holds nothing back on a base never seen red, and
**leaves a base seen red as red** (`red`: the commit of the red that remains). Only a check
**run and green** lifts the red. A check that was not run is not retried at every tick, and it
**closes** a requested replay: `run status`, `run pass` and `run base` show the reason —
**repairing the repository is up to you**, then `base -- replay`.
