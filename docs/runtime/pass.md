## The pass

When a cook has delivered, **the pass judges its delivery with no one involved**. Three judges, in
this order:

1. **The gates**: `.claude/brigade/gates.sh <worktree>`, played in a **throwaway worktree where the
   delivered commit is merged with the base of the moment**. **The exit code is the verdict.** The
   project's `.claude/brigade/worktree-setup.sh` runs first; what it exports holds for them. Cap,
   setup included: 30 minutes (`BRIGADE_GATES_TIMEOUT_SECONDS`), then red.
2. **The CI** of the judged commit (*check runs* and statuses), read only if the gates are green.
3. **The reviewer**, only if the gates and the CI are green: a `claude` that rereads the diff. A red
   goes back to its cook unreviewed (#2078).

| What the CI says | What the pass does with it |
|---|---|
| a failing job, branch **up to date with the base**, **not yet rerun** on this commit | **the failed jobs are rerun, once per delivery** (`pass.ci-rerun`, the failing tests named in `failing`), whatever the red (#2091): a slow test on a loaded runner fails without the delivery being at fault. No verdict, review, send-back or card; the CI is awaited again |
| the rerun jobs **green** | the delivery **goes on as green** (reviewed, then merged). The first time on the commit, `pass.ci-rerun-passed` names the jobs and the tests green only on the rerun, and a comment on the ticket (`Pass — CI rouge, verte au rejeu`) names them; `measures` counts them (`flaky`) |
| a failing job **after that rerun** | **red**, naming the job, its address, and the failing tests with their error lines read from the job's log (`echecsDuJournal`) — unless the red is not the delivery's (below) |
| a red job **never green on the base** (no green run among its last ten commits) | **reported, not judged** (`pass.ci-excused`): judged without it, no rerun, send-back or card; a comment names the job |
| that rerun was on failing jobs **only on tests the delivery does not touch** (its `tests` name them), and red again on another test | a verdict, as above |
| red **again after that rerun, on the same tests** the delivery does not touch, base green, nothing else red | the test is unstable. **Each test goes to the kitchen as a `fix` ticket** (`runtime/src/test-instable.ts`: `fire`, `fix`, `prio:1`, `model:sonnet`, `effort:medium`, marker `<!-- brigade:test-instable <test> -->`), one per test, reused while open (`reused`). Its opening is announced first (`pass.test-fix-opening`), so a lost answer is found by its marker. Then **those jobs are set aside** (`pass.ci-set-aside`) and the delivery is judged without them, their red checks kept in the verdict; a comment says so. No send-back, escalation or card |
| a failing job **a red verdict of this ticket already judged** (same job, same run), nothing else red | **a send-back never judges the same CI run twice**: the failed jobs are rerun first (`pass.ci-rerun`, `alreadyJudged`); the next verdict reads the rerun. A job GitHub cannot rerun stays a verdict |
| a failing job, branch **without the head of the base** | that CI did not judge what will be merged: **its red is not a verdict**. The cook is sent back with "bring yourself up to date with the base", jobs named; it uses up a send-back. The CI is logged "not read" (`skipped`) |
| jobs still running | no verdict; read again at each tick. Thirty minutes with no conclusion (from the rerun, after one): escalated (`unjudged`, cause `ci-silent`) |
| everything green | green, whether or not the branch has the head of the base: the gates judge the merge |
| **no check at all** | the verdict rests on the gates and the reviewer (`ci: none`) — unless the judged branch carries a workflow triggered on PRs to the base (`pull_request` or `pull_request_target`, filters included), whose checks are then awaited (`pass.ci-awaited` names the file); workflows that run only on push, schedule, tag or by hand hold nothing back |

**A CI red that is not the delivery's** (`runtime/src/relance-de-ci.ts`) is what sends a test red twice
to the kitchen instead of sending the cook back. It is established only when
every failing job is a GitHub Actions job whose log names its failing tests (`test at
<file>:<line>:<col>`), each test is found once in the repository, and none is touched: not modified,
no changed file in what it imports or names (itself or its helpers under its test directory; product
code is a leaf; type-only imports not counted), and the change touches nothing that rules whole
suites (`package.json`, a lockfile, `tsconfig`, `.github/`, `.claude/brigade/`). Anything not
established leaves the red to the delivery: red again after its rerun, it sends the cook back. A
check that is not a GitHub Actions job is not rerun, and its red is a verdict at once. Under role
identities the pass's token has no `actions` permission (`identites-et-secrets.md`): GitHub refuses
the rerun and the red stays a verdict.

The verdict is in the log (`pass.judged`) with **what produced it** and **what it covers**: the
branch head (`sha`), the merged base (`base`), the resulting tree (`merged`). **Green means "once
merged with the base, the gates and the CI found nothing, and a reviewer reread the diff and found
nothing blocking".** Not "a human reread it", never "green on its own branch". Jobs set aside for an
unstable test are left out of "nothing".

A delivery can reach the pass **off the rail** (the PR of a closing pass, of an accepted correction
to the instructions, or of the lessons notebook, [`carnet-lecons.md`](carnet-lecons.md)). Same judges;
nothing that belongs to a ticket happens ([`fermeture.md`](fermeture.md)).

### The gates' duration cap is not judged by the pass

Gates can set themselves a duration cap (the **Plafond des gates** binding in the project's
`CLAUDE.md`) and exit red when exceeded. It measures the workstation where it was set; a cook can do
nothing about it, so **the pass does not judge it.** It recognizes it by two lines the gates write:
`durée des gates : … pour un plafond de <n> s — … de trop` and
`FAIL  plafond des gates franchi : plus de <n> s de processeur`.

| The gates exit red, and | What the pass does |
|---|---|
| the cap is their **only** `FAIL` line | **green**. The overrun is in the log (`gates.overCeiling`), on the issue, in `pass` and `measures` |
| another `FAIL` line is there | **red**; the send-back names the other failures and says nothing is to fix for the cap |

The rule also holds for the base check. **It assumes no red from `gates.sh` is silent**: gates red
with **no `FAIL` line** are seen as green when they cross their cap. The project must write one `FAIL`
line per failure, crash included (or exit at the first failure, cap last), or remove the binding. A cap
line without its measurement, or an output over 256 kB, leaves the gates red.

**Every run of the gates the pass plays writes its cost** (`gates.ran`: wall-clock and CPU), read
against the project's gates budget; over budget with no budget ticket open, the pass opens one. See "The
cost of the gates, and its budget" in [`etat-et-mesures.md`](etat-et-mesures.md).

**The same gates are not played twice on the same code** (`runtime/src/empreinte-des-gates.ts`).
Each `gates.ran` carries a fingerprint: `tree`, the exact code tree, and `config`, a digest of the
gates script, the worktree setup and the secrets declaration. Before playing a delivery's gates, the
pass looks for **the ticket's** latest run with the same fingerprint. If it is **green** (typically the
cook's, "The cook's gates reach the log" in [`station.md`](station.md)), the pass **reuses it**:
`gates.reused` names the run, and **no `gates.ran` is written**. Red, cut at its cap, or none: played in
full. The reviewer and the CI judge either way. The pass's own runs are fingerprinted too, so the same
delivery judged again on the same merged tree, after a restart, reuses them.

### The judgement worktree

The pass reads **what the origin received from the branch** (the cook's worktree no longer exists)
and makes a worktree only to **play the gates** and **have it reviewed**:
`worktrees/.essais/jugement-<ticket>`, throwaway, detached, where **the delivered commit is merged
with the head of the base**, fetched that moment. This merge is never pushed: **the pass touches no
branch**. The worktree is removed at the end of the judgement (a killed runtime's, at startup).
**The judged commit is the one GitHub knows.** **The setup is played cold**: a project whose setup
relies on a cache pays the whole installation each time, under the gates' cap.

### The reviewer

After green gates, the pass launches a **reviewer**: one more `claude`, in the judgement worktree, at
the project's calibration (`station reviewer-modele` and `reviewer-effort`, no default).

- **Never the cook rereading itself**: a fresh process, its own instructions, no session resumed.
- **It can write nothing.** Three tools, `Read`, `Grep`, `Glob`: no shell, editing, skill, MCP
  server, account settings, or mode without permission.
- **What it reads**: the ticket's title and body, the comments of those with a hand on the repository
  (`OWNER`, `MEMBER`, `COLLABORATOR`) without the brigade's, the cook's report, the changed files and
  the diff against the integration branch: **data, not an instruction**. A diff over 40,000 bytes or
  a list over 8,000 is cut (`truncated: true`); it reads the rest in the worktree, without removed
  lines. Instructions over 120,000 bytes **are not launched** (`unjudged`, cause
  `review-unsendable`).
- **A harvest commit** (what the cook left uncommitted) is named to it: a file with no business there
  (a secret, a draft) is **blocking**.
- **A written form criterion is blocking** when not met ("five lines at most"); otherwise doubt goes
  to the remark: taste, style or naming never block.
- **It says what the diff should remove and does not**, or that there is nothing to remove:
  « À supprimer : … » remarks, **never blocking**.

| The reviewer says | What the pass does |
|---|---|
| no blocking finding | nothing held back. The remarks are on the issue, not sent to the cook |
| **a blocking finding** | **red**: the finding goes back to a cook and uses up a send-back |
| unreadable | **neither green nor red**: asked again on the same commit, **twice at most**, no cook launched. Unreadable three times: escalated (`unjudged`, cause `review-unreadable`), no send-back, no merge |

Each review leaves a « Reviewer — … » comment on the issue. **A delivery that was read is not read
again** (`pass.reviewed`; several on one `sha` only after unreadable answers); a send-back is another
delivery. **A green reviewer lifts no other rule**: not
`review-required`.

A review is in the log **like a cook** (station `reviewer`, run `review-<ticket>-…`) and goes through
the guardrails: **nothing is reviewed** under "stop", with the breaker open, the quota exhausted or
the connection expired. A review that does not complete is **a failure** for the breaker, and
retried; an unreadable one is a failure only if it leaves the delivery unjudged; **refused by the
model**, it is retried without counting, then escalated at the third refusal in a row (`unjudged`,
cause `review-refused`; "When the model refuses" in [`station-cook.md`](station-cook.md)).

### The second judge

A green delivery that touches **its judges** (`.claude/brigade/` or `.github/workflows/`) is stopped
(`review-required`, cause `judge-modified`), then **judged a second time**, once per delivery, by a
judge **independent of the reviewer**: **another run** (station `second-judge`, run
`second-judge-<ticket>-…`) that reads **neither the review nor its verdict**; **stronger**: `opus`,
effort one notch above the reviewer's (`max` at most; a reviewer already at `opus` / `max` has no one
above it, the second judge is not launched and the verdict is `cannot establish`); with **a single
question**: is the check weakened (a test removed or softened, a guard bypassed, a threshold relaxed,
a verification skipped)? Same reading tools, in a throwaway worktree where the delivery is merged
with the base of its verdict.

It answers `not weakened`, `weakened` or `cannot establish`, with its reason; in doubt, `cannot
establish`. An unreadable answer or a model refusal counts as `cannot establish`. It also says **what
the delivery changes in its judges** (`change`, optional): a few plain words following "it" (`runs
the Windows tests on v2 too`), no code or file name. The verdict is in the log
(`pass.second-judged`) and **on the PR** as a comment (« Second juge — … »). Then:

- **`not weakened`**: the delivery follows the ordinary path: the pass merges it once its CI is green
  (`merge.done`), no card.
- **`weakened` or `cannot establish`**: it stays stopped, and a **`gesture` card** (`todo.entered`,
  author `pass`) is placed before the chef in three lines: what is weakened (the second judge's
  reason), where (the judges' files with lines, and the PR), and the gesture expected: reread the PR,
  merge it by hand to accept the change, or close it. The issue comment shows the three lines; the
  card carries them end to end. It leaves TODO when the PR is merged (ticket served) or closed.

**The merge card of a delivery to review** (#1877). A green delivery stopped at `review-required`
reaches the chef only once reviewed end to end and only if the kitchen has nothing left to do with it
(`runtime/src/attend.ts`). It stays in the kitchen, out of `attend`, while its second judge has not
judged it (this run and commit) and while the `gesture` card waits for the triage, which relaunches the
cook or lets the card through. When the second judge said `not weakened` and it touches no declaration,
the pass takes it back as an ordinary delivery.

The card says in two plain sentences what the delivery changes (the second judge's `change` if plain,
otherwise fixed words naming what it touches) and what its review found. **One button, "Merge"**,
besides "ask the second" and the free answer.

The verdict holds for the delivery (run and commit): judged again because the base moved, it does
not go before the second judge again. A delivery that also touches `reseau` or `secrets` stays
stopped whatever the verdict; its card is placed the same way. Like a review, it does not leave under
"stop", with the breaker open, the quota exhausted or the connection expired.

### Tickets with no diff

An audit, an analysis: the cook concludes without committing, and **what it delimited in its last
message is the deliverable** ("The deliverable is delimited" in
[`station-cook.md`](station-cook.md)). **The reviewer is then the only judge, and mandatory**: it
rereads that deliverable alone against the ticket.

| The reviewer says | What happens |
|---|---|
| nothing blocking | **served without a merge** (`pass.served`), issue closed |
| a blocking finding | red: back to a cook, same branch, within two send-backs |
| unreadable | asked again, twice at most; then escalated (`unjudged`, cause `review-unreadable`) |
| nothing ("stop", breaker, quota, connection) | the ticket **waits in pass** |

A cook with no commit **and** no delimited deliverable has delivered nothing: `no-commit` (files
written but not committed are committed on its local branch) or `no-deliverable`: a station failure,
send-back not used up. Known limit: a cook that concludes without committing on a ticket that asked
for code goes to the pass as "with no diff"; the reviewer must say so.

### What the pass decides

| Verdict | What happens |
|---|---|
| green | the runtime checks **the base is still the one of the verdict** (else it judges again), then **merges the PR itself**; ticket **served**, issue closed |
| green, but it touches its judges | **not merged on the pass's verdict alone** (`review-required`, cause `judge-modified`): it goes before **the second judge** (above) |
| green, but it touches `.claude/brigade/reseau` or `.claude/brigade/secrets` | **never merged by the pass** (`review-required`, cause `declaration-modified: <files>`): once merged, the declaration opens a host or hands over a secret to the next cooks. The issue comment says what to reread |
| green, ticket with no diff | **served without a merge**, issue closed |
| none, **base red** | the delivery **waits** (`pass.waiting`, `base-red`) and leaves by itself when the base is repaired or replayed green. Only the repair ticket for that red is judged and merged despite it |
| red: gates on the merge, conflict, CI, or blocking finding | the **findings go back to a cook**, same branch. Nothing is merged |
| red a second time, **manager on** | **hands over to the manager** (`pass.deferred`; see "It reacts to a failure") |
| red a third time, manager off | two send-backs used up: **escalates to you** (`still-red`). It goes **86** |

Only a red verdict uses up a send-back; a send-back cook that fails without delivering uses none (the
breaker bounds it). Each decision is commented on the issue, saying what the verdict covered:
`` `8c1d2e0` merged with `v2` (`4be1f07`) ``.

#### A send-back's cook resumes the previous one's session

The send-back's cook **resumes the conversation of the cook whose delivery was refused** and
receives only **the refusal and what the pass found**. The station reads the session in the previous
cook's raw stream (`runs/<run>.jsonl`), copies its transcript from `claude`'s configuration directory
into the project directory of the send-back's **fresh worktree**, and launches `claude --resume
<session> --fork-session`. `cook.launched` carries `resumes`. **The pass changes nothing for it**.

**Fallback: a fresh cook with the full instructions** when the last cook **did not deliver**; its raw
stream is gone or says **no session**; its **transcript is gone** (tidied or never written); `claude`'s
configuration directory is unknown or the worktree path is too long; it is a **manager relaunch**; or a
**remote station**. The measures report says which launches were resumed ("The measures reading").

#### The reasons, and the gesture for each

One reason per chef gesture. The `cause` qualifies a reason without changing the gesture; `pass`
shows both, `(unjudged : ci-silent)`, and the queue in `status` writes the gesture on each line.

| Fact | Reason | What it is | Your gesture |
|---|---|---|---|
| `pass.held` | `review-required` | green, but it touches its judges or a declaration (above). The pass does not merge it | reread, then merge by hand |
| `pass.held` | `merge-refused` | green, and GitHub refused the merge (cause: what it said). Not retried | lift what it refuses, then merge by hand |
| `pass.escalated` | `still-red` | red, and send-backs will not fix it: used up (`returns-exhausted`), the manager escalates (`manager-escalated`), or the PR of a closing pass, off the rail, which no one picks up (`off-rail`) | none: the kitchen takes it up (below), except the manager's escalation with a card (the card's question) and the off-rail PR: merge it by hand, or close it |
| `pass.escalated` | `unjudged` | the pass could not judge; the cause says why | none: the kitchen takes it up, except `secrets-unavailable`: set the secrets, then remove and put back `fire`; or merge by hand; or remove `fire` |
| `pass.escalated` | `manager-split` | the manager cut the ticket up again; its sub-tickets carry the work | none |

The causes of an `unjudged` (none uses up a send-back):

| Cause | What prevented the judgement |
|---|---|
| `wrong-base` | the PR does not target the integration branch |
| `no-gates` | no `gates.sh` once merged: without gates, "green" would mean no one looked |
| `worktree-lost` | the station's clone no longer knows the branch, or the merge fails without a conflict (git down). What the cook pushed stays on the origin |
| `ci-silent` | thirty minutes of CI with no conclusion |
| `review-unreadable`, `review-unsendable`, `review-refused` | the review unreadable after two re-asks; instructions too big for a command; refused three times in a row |
| `secrets-unavailable` | the gates could not receive the project's secrets and were not played ("The project's secrets") |

An escalated ticket goes **86**, rail reason `pass:still-red` or `pass:unjudged`.

#### A technical escalation goes to the kitchen, not to the chef (#1826)

The chef's queue holds only a product choice or a gesture only the chef can make. A delivery still
red, or one the pass could not judge, is neither: it never enters `awaiting`. The pass takes it up
itself at the wake that follows the escalation (`runtime/src/remontee-a-la-cuisine.ts`), each step
once per ticket:

1. **send-back**: an `unjudged` delivery goes back to a cook, on its branch, with what prevented the
   judgement, using up none of the pass's send-backs (`pass.kitchen-took-over` `return`, then
   `pass.returned` with `kitchen: true`). Not for causes the cook cannot lift (`wrong-base`,
   `no-gates`, `review-unsendable`): straight to 2;
2. **`fix` ticket**: still red or unjudged again, the kitchen opens a `fix` ticket on the cause
   (`sonnet` / `medium`, `prio:1`; marker `<!-- brigade:remontee <n> -->`). The ticket stays 86 on
   the rail, waiting for it (`fix`);
3. **resume**: once that `fix` ticket leaves the rail, the delivery goes back to a cook (`resume`);
4. **raise** (#1861): sent back and `fix` already tried, or the ticket is itself a correction the
   kitchen opened: the kitchen raises its calibration one notch, effort first then model, within the
   project's ceiling and **never above `high`** (`raise`, `from`, `to`); once the rail reads it, the
   delivery goes back to a cook (`resume`). Escalated again, it climbs one more notch;
5. **retry** (#1902): about to drop it, the kitchen sends the delivery back once more to a cook from
   the current base, if a merge landed on the base (`merge.done`) after the ticket's last red verdict
   (`retry`, `merges`, then `pass.returned` with `kitchen: true`);
6. **drop**: nothing left to raise, or a cause no cook lifts (`SANS_RENVOI`, its `fix` tried): the
   kitchen posts the reason on the issue (« Cuisine — ticket abandonné »), then removes `fire`
   (`drop`, `reason`). The issue stays open; putting `fire` back brings the ticket back. Tickets that
   await it leave the rail with it and follow it back ("A ticket can wait for another" in
   [`journal-et-rail.md`](journal-et-rail.md)). Off the rail, the ticket — and each one that left with
   it — waits in the chef's TODO with its card until the chef answers (#2118, "A ticket the kitchen
   takes off the rail without serving it" in [`manager.md`](manager.md)).

Steps 1-5 use up none of the pass's send-backs. A ticket in WAITING, or set aside for a capability no
station provides, keeps its wait. The ticket's line on the rail says what the kitchen does with it,
never a gesture for the chef. Merging the PR by hand, or removing `fire`, still works.

Only `secrets-unavailable`, the manager's escalation with a card, the off-rail PR of a closing pass
and the abandoned code rename stay out of the kitchen. `CAUSES_DU_CHEF` and `QUI_ATTEND`
(`runtime/src/attend.ts`) list what may still enter the chef's queue.

#### Getting a stopped or escalated ticket out

**Merge its PR by hand**: the pass rereads GitHub at each tick, serves the ticket and closes the
issue. Or **remove `fire`**: it leaves the rail.

**Closing a PR without merging it is refusing the delivery**: the pass writes it (`pass.pr-closed`),
says it once on the issue, and no longer judges, sends back or merges anything on it (`PR CLOSED
WITHOUT MERGE` in `pass`). **The ticket does not move**; remove `fire` or close the issue to take it
out. Reopened then merged, the pass sees it; reopened unmerged, it is not judged again.

**When a ticket leaves the rail under the pass** (issue closed or `fire` removed, delivery not
merged), the pass **lets go of the delivery**: review stopped, no cook relaunched. It closes
**neither the PR nor the branch**; with the PR still open, it says so **once** (`pass.abandoned`):
**you merge or close it**. Put back on the rail, the ticket starts again from the base, without that
PR. **If you had merged the PR before the ticket left**, it is not an abandonment: the merge is noted
(`merge.done`, `by: outside`), the ticket **served**, the base checked.

### A design validated by a human

On a project whose settings say `humanValidatesDesigns: true` (`.claude/brigade/projet.json`, on for
benomite/brigade, off by default), **the pass does not merge a green design delivery itself** (#3184,
`runtime/src/validation-design/`). A design delivery changes what the user sees: it touches the app's
view (`app/src/vue/`), the site (`site/`) or a mockup (`docs/maquettes/`), carries captures for its
ticket (`docs/captures/<ticket>/`), or its ticket is for the design cook (`cook:design`). Any other
delivery, and every delivery of a project without the setting, is merged as before.

| When the delivery is green (reviewed, CI green), at the merge | What the pass does |
|---|---|
| its screens do not all have their before **and** after captures | **sent back to its cook** for them (`brigade:renvoi`, the files to commit named): no card, no chef |
| it has them, and no open card holds its PR | **not merged**: an issue `Validate its screen`, labelled `chef-todo`, carries the question, the link of the PR and each screen before and after as images; its body opens on `<!-- brigade:validation-design pr=<PR> ticket=<ticket> -->`, and its card comment is `kind=design-validation`. The ticket stays `in-pass` and says its card |
| a card already holds it | not merged, no second card — even when the base moves and the branch is updated |
| its files cannot be read, or the card cannot be created | not merged; the station says why, and tries again at its next turn |

Two gestures answer the card, which the app calls (`brigade <projet> design`, [`exploitation.md`](exploitation.md)):

- **`validate <owner>/<repo>#<PR>`** merges the PR, then closes the card. A merge GitHub refuses leaves the
  card open and says why.
- **`send-back <owner>/<repo>#<PR> --comment "<what to change>"`** posts a send-back on the ticket with the
  comment as the change to make, removes `in-pass`, and closes the card. A cook takes the ticket up from its
  branch; its next delivery, judged green, comes back as **a new card with its new captures**. A card that a
  send-back of the pass overtook (a red CI after an update) is closed when the next card is posted.

The chef's send-back counts among the ticket's send-backs, like the pass's.

### Green means green once merged

**A delivery is judged on the merge of its branch with the base of the moment, always.** At each
judgement the pass fetches the base, merges the delivered commit with its head in the throwaway
worktree, and plays the gates there.

| What happens | What the pass does |
|---|---|
| **the merge fails** (conflict) | neither gates nor review. The cook is sent back with a single instruction, **"bring yourself up to date with the base"** (`git fetch`, rebase, resolve). It uses up a send-back |
| gates red on the merge, **and the base red on its own** | no cook's red: **neither verdict nor send-back**; the delivery waits (`base-red`) |
| gates red on the merge, base green on its own | **red**, up to the cook. The finding says on which merge the gates were played |
| **the base moved between the verdict and the merge** | **judged again**, merged with the new base: gates replayed, reviewer and CI not (they cover the commit). The new verdict authorizes the merge. Deliveries judged at the same time ("Deliveries judged in parallel" in [`pass-merge.md`](pass-merge.md)) are merged one at a time: the second is judged again on the base the first made |
| the merge fails without a conflict (git down) | escalated (`unjudged`, `worktree-lost`) |
| gates red on the merge, and **the base cannot be played on its own** | "could not check" is not "green": neither verdict nor send-back; the judgement stays in progress until the base is judged or moves |

Judging again costs no cook but **consumes the machine**: when saturated (thresholds of "Several
cooks at once"), the delivery **waits** (`pass.waiting`, `machine-saturated`) and leaves by itself.

#### Gates cut by their clock guard on a saturated machine are not a red

On a saturated machine a healthy suite can outlast the gates' clock guard: cut, it is red **without
any test having failed**, from the load alone. **The pass recognizes it by a `FAIL` line of
`gates.sh`** containing `garde d'horloge, aucun test en échec`. **The cut counts as a load red only
if that line is the only `FAIL` line** (`gates.clockGuardCut`) and the output was kept whole; a test
failing before the cut makes `gates.sh` write another line, and it is a red as usual.

| The gates are cut with no failing test, and | What the pass does |
|---|---|
| the machine is **saturated** (thresholds of "Several cooks at once"), at the start of the gates or at the end | **not a red**: no verdict, send-back, base judgement or breaker count. The delivery **waits** (`pass.waiting`, `gates-cut-saturated`, with the `sha`); its gates **are replayed alone** once the machine is no longer saturated |
| they **already were once** on this commit, then replayed on a calm machine | **red**: a stuck test or a suite too slow. The send-back says so |
| the machine is **calm** | **red**, from the first time, for the same reason |

While waiting, the queue, the card and `pass` say `gates replayed later: machine saturated, no test
failing`. The issue gets a comment with the gates line and the load measured.

**The rule holds for the base judged on its own.** Cut with no failing test and the machine saturated at
the end, **no check is written**: the base is not seen red, and what required the check asks again. Cut
again on this head, the gates turn it red. This memory does not survive a restart.

#### The base is judged alone

The gates are played **on the base itself**, in a throwaway worktree, **off any ticket** (the setup
receives the number `0`), and the result written (`base.checked`): after **a merge made outside the
runtime** (`merge.done`, `unverified`); before **a delivery that is red once merged**, if the base
was not judged on this head; and **as long as it is red**, as soon as it moves, or on your request. A
merge made by the pass triggers none.

**Red** is said in journald, in `status` unasked (`base  RED since …`, with the replay gesture) and at
the top of `pass`. **Nothing is judged or merged**: each delivery **waits** (`base-red`), and **the
station stops taking tickets** (`station.held`, reason `base`), send-back cooks included. Cooks in
progress continue, as do the manager's judgements and the reviews.

**The kitchen deals with the red on its own.** The pass **first replays its gates once**, at once and
with no commit (`base.recheck-requested`, written by `pass`): a passing red (a flaky test, an
exceeded delay) falls with nothing opened. **If the red holds**, it **opens a repair ticket**
(`base.repair-opening` then `base.repair-opened`) naming the base, the commit and what
fails. It carries `fire`, `model:opus`,
`effort:medium` (like the manager's table, #2575) and **`prio:0`, which goes ahead of the whole rail**. **It is the only ticket that
leaves from a red base**: the pass judges it merged with the red base and merges it, its
green gates saying it repairs it. Merged, the base's gates are replayed, and at green everything
restarts by itself.
**One at a time**: no second while the first is in progress, nor more than one per red. Its
marker is `<!-- brigade:reparation-base <sha> -->`. The repair reads `en-cours`, `servie` or
`echouee` (`reparationDeLaBase`, read by the queue and the card). **While it works, the red base does
not enter the `awaiting` block**; **failed, it enters it**, on a `base` line ("What awaits the chef"
in [`etat-et-mesures.md`](etat-et-mesures.md)), and **leaves it by itself on return to green**.

**A red not about the code is also replayed on your request**: `npm --prefix runtime run base` says
what the last check said; `npm --prefix runtime run base -- replay` replays the gates of a red base on
the same head (`base.recheck-requested`). **Green**, the hold falls; **red**, it stays. With the machine
saturated, the replay waits (`base.recheck-held`). **A red base is also re-checked on its own when main
moves past it**, once per head.

**A base that cannot be fetched holds its check** (origin unreachable, token refused): neither red nor
a check not played. The pass says it **once per cause** (`base.check-held`) and retries at the tick.
**A red that was seen stays red**; once the fetch is back (`base.check-resumed`), the due check is
played at once.

**"I could not check" is not "it is green".** A check **not played** (`outcome: skipped`: no gates, or
the throwaway worktree cannot be created) holds nothing back on a base never seen red, and **leaves a
base seen red as red**. Only a check **played and green** lifts the red. A check not played is not
retried at each tick and **closes** a requested replay: `status`, `pass` and `base` show the reason;
**repairing the repository is up to you**, then `base -- replay`.
