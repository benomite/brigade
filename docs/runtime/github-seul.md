# The GitHub-only station: the kitchen's only path

Every project's kitchen runs on GitHub as its only state ([spec](../superpowers/specs/2026-11-02-github-only-state.md),
epic #2053). The project's stations take, cook, review and merge its tickets reading and writing only GitHub:
issues, labels, claim comments, pull requests and the CI of the base. Every station is equal, and stopping one
stops nothing else. The code is `runtime/src/brigade-github.ts`, which chains `github-etat/` (a ticket's and the
base's state, the claim, the review and the merge) and `github-seul/` (the guardrails of a turn, the hold on a red
base, the stale-branch pruning).

## The turn

- **Who opens it.** A per-project runtime (`main.ts`) and each project's kitchen in the multi-project station
  (`station/cuisine.ts`, which is what the box runs) open it at opening, under the name of the station the project
  declares on this machine (`box/claude`). A runtime that cannot serve it says why and cooks nothing for the project:
  `status` then has a `GitHub-only state REFUSED` line with the reason (`GitHub-only state` alone when accepted),
  `facts` carries it as `githubSeul`, and the app puts the refusal at the top of the project
  (`runtime/src/github-seul-etat.ts`).
- **A station without write access is a contributor station** (#2935). At its first turn the station reads the
  machine's account and whether GitHub gives it push on the repository (`droits` in `runtime/src/github.ts`; under a
  role identity, an App installed on the repository, it writes and nothing is read). Without push, the turn runs the
  contributor station (`runtime/src/station-contributrice/`) instead of the one above: it creates its fork or finds
  the one it has, claims a ticket with a comment signed by its account
  (`<!-- brigade:reclame station=… login=… -->`), reads the issue again, and cooks only if its claim is the oldest
  valid one; then it pushes the cook's branch to its fork and opens a pull request from the fork to the project
  (`Closes #n`). It sets no label and never reviews or merges. A claim counts only when posted by the account it
  names; it holds until that station releases it (`<!-- brigade:rend … -->`, posted when its cook delivers nothing, or
  when its claim lost the race) or until it expires, 6 hours after it was posted — a station whose cook runs longer
  posts it again after half that time. A station does not take again a ticket whose cook blocked on a question, nor
  one whose cooks delivered nothing `ECHECS_MAX` times; that count lives with the station. A delivered ticket keeps its claim, then its open pull request keeps it off the
  other contributor stations. Rights that cannot be read fail the turn, and the next turn reads them again.
- **`blocked-on-human` needs a question.** The label is only set with a question written on the card
  (`poserALaMain`, `runtime/src/blocages-sans-question.ts`): the question is commented first, then the label set.
  Without one the label is not applied, the station warns, and the case is counted — a failure, not a step. The count is
  never reset; `status` shows it (`blocked w/o q`) and `facts` carries it as the integer `blockedWithoutQuestion`
  (#2556).
- **A blocked cook goes to the manager, not to review.** A cook that writes `<bloque>…</bloque>` in its deliverable —
  the decision or condition it lacks: a ticket it depends on not merged yet, an access, a machine — never sets
  `blocked-on-human` itself, with or without commits: its question goes to the manager first (next item), `taken` is
  released, and no station takes a ticket carrying `blocked-on-human` until the chef removes it. What it
  committed stays on its branch, pushed; with no PR yet, the branch head is marked as saved work (#2586), so the cook
  that resumes after the answer starts from it instead of the pass judging it as a delivery. That cook may deliver the
  saved head as is, with its deliverable — the manager's answer when the blocked cook's work was done: it goes to the
  pass, and does not count as a failed cook "added nothing since its last delivery", as it did on #3036. Since #2061 the station
  never read `<bloque>`: the partial work of a blocked cook went to review, came back red, and the next cook blocked
  again — 6 of the 13 blocking reviews on BOBL-tech/espace (#798 four times, #755 twice) (#2805).
- **The manager answers a technical block; only a product or design decision reaches the chef.** The station runs the
  manager — its calibration, the reviewer's read-only tools, in a worktree of the ticket's branch — on the cook's question
  and its previous answers on this ticket (`runtime/src/blocage-au-manager.ts`). A technical question — a tool, a path, a
  repository, a choice between technical options, an access the kitchen has — is answered on the issue
  (`<!-- brigade:reponse-au-blocage n=… -->`: the cook's question, the answer, the decision taken) and the ticket goes
  back to a cook from its branch, with no `blocked-on-human` and not counted among its tries. A product or design
  question sets `blocked-on-human`, the comment opening on the question in one line
  (`**Question for the chef (product):** …`); a gesture only the chef can make sets it too, the comment opening on the
  exact gesture (`**Gesture for the chef:** …`). After two technical answers, the third block goes back to the manager
  with both answers, and its decision is appended to the ticket's body once (`<!-- brigade:decision-du-manager -->`);
  a block on a ticket that already carries it, or a decision the station cannot write, counts as a cook without a
  delivery (`brigade:echec`), so `ECHECS_MAX` bounds it. A manager that cannot answer — its run fails, its answer is
  unreadable, the station has none — sends nothing to the chef: the ticket waits (`brigade:attente … manager`), then
  is retried; the third such wait since the ticket was last relaunched counts as a cook without a delivery. Seen on #2875 (#2894).
- **A blocked question the evidence answers goes back to a cook, not to the chef.** When the blocked ticket is a
  quality ticket that counts tickets (`brigade:qualite-comptes`) and the question asks for what that evidence holds —
  which tickets, their send-backs or cooks without a delivery, their reasons, their timestamps — the station appends
  to the ticket's body, under `<!-- brigade:preuve -->`, every `brigade:renvoi` and `brigade:echec` a station wrote on
  each counted ticket, with its time and reason, and gives the ticket back without `blocked-on-human`, not counted
  among its tries (`runtime/src/relance-blocage-preuve.ts`). Once only: a ticket that already carries the evidence and
  blocks again goes to the manager, as does a question the evidence does not answer, or evidence the station cannot
  read or write (it warns why). Seen on #2832, #2837 and BOBL-tech/espace#825 (#2841).
- **The kitchen keeps a cook branch up to date with `origin/<base>`.** A new branch starts from the base the station
  has just fetched. Before a cook resumes an existing branch, the station fetches the base in its worktree and merges it
  into the branch if the branch does not hold its tip (a branch in conflict follows the conflict send-back instead,
  #2953); a merge that fails is undone, the station warns, and the cook starts from its branch as is. When a cook blocks because it needs commits that are on the base and not on its branch, the station
  commits what the cook left, fetches and merges `origin/<base>` into the branch, and gives the ticket back to a cook
  from it, not counted among its tries. If it cannot — conflict, refusal, network —, the merge is undone, the station
  opens a `fix` ticket under the manager's fix labels (`brigade:remontee <n>`), and the ticket waits for it on the rail
  (`brigade:attend-ticket`). A branch that already holds the tip leaves the question to the paths above. No TODO card,
  never `blocked-on-human` (`runtime/src/mise-a-jour-branche/`). Seen on #2910, #2914 and #2915 (#3001).
- **A red cook PR held for the chef goes back to a cook.** At each turn's healing, an open PR on a `cook/<n>-github`
  branch whose head has a red check, and whose ticket is on the rail and held for the chef (`blocked-on-human`,
  `chef-todo`) with no cook on it — not cooking on this station, not `taken`, not `in-pass` (the pass sends its own
  red back), not `hors-cuisine` (the relaunch's), not `waiting` —, is sent back: the hold labels are removed, then a
  `brigade:renvoi … sha=<sha> ci-rouge` comment names the red checks, and the ticket is free for a cook from its
  branch (`runtime/src/ci-rouge/ci-rouge.ts`). A head is sent back once by this path; the send-back counts among the
  ticket's `RENVOIS_MAX`. A green, pending or check-less CI, a free ticket, or another branch is left alone; open
  PRs are read only when a held ticket exists. A CI or head that cannot be read sends nothing back and is warned.
  Seen on #2908, whose red CI ended as a "merge it" request to the chef (#2970).
- **Every 2 minutes** (#2296), a turn takes, cooks, reviews and merges. Each turn reads its tickets, the open PRs with their CI, files and mergeability,
  and the base's CI in one GraphQL query (#2301), and falls back to REST for that turn when the query fails.
  A ticket the manager makes claimable — it lays `fire` or the calibration, or fires a ticket of a split — brings a
  turn at once on the station that runs it (#2796): before, the ticket waited for its claim until the next interval, up
  to 2 minutes of every manager-qualified ticket's lost time. So does a cook that ends without a delivery, once its
  ticket is given back (its place is free), and a merge (a dependency, a held zone or a pass place may be free): the
  rail is read again at once, not at the interval nor 30 s later (#2802) — on the computer's station too, whose loop
  waited the 30 s until #2832 ([diagnosis](claim-wait-2026-11-07.md)).
- **At most 5 deliveries in pass** (`PASS_MAX`, #2300): while the project has 5 or more tickets `in-pass`, no station
  takes a new ticket. A ticket sent back from the pass to a cook leaves it in the very turn it is sent back.
- **Places.** A station never holds more tickets than its places; a cook that fails keeps its place until the turn
  gives its ticket back on the issue, and at its first turn a restarted station gives back the tickets it held with no
  cook (#2179).
- **A cook that adds nothing.** A cook that resumes a ticket's branch and ends without moving its head delivered
  nothing: it counts as a cook without delivery (`ECHECS_MAX`), so a ticket cannot loop between the cook and a pass
  that already sent that head back (#2372) — unless its PR is open and conflicting with the base or red (#2454): the
  cook is then told in its brief to bring the branch up to date (or start again from the base), and if it still adds
  nothing the ticket is given back with a comment, uncounted, since that is work left, not a failed cook.
- **A cook that disagrees with the review.** Sent back on review remarks, a cook that judges them already addressed or
  wrong replies on the PR instead of ending silently: its brief tells it to write the reply in its last message between
  `<reponse-pr>` tags, and the station posts it on the PR (`brigade:reponse-cook sha=…`), since the cook has no GitHub
  access. A stop that adds nothing but carries such a reply, posted since the send-back, is a disagreement, not a
  failure: the delivery goes back to the pass as is, which judges the head again with the reply in its brief, and
  accepts it or sends the head back with its reasoning. That send-back counts among the `RENVOIS_MAX`, so a
  disagreement cannot loop (#2592).
- **A delivery cut before its PR.** A branch the station pushed but that never had a PR (the station stopped between
  the push and the PR, or GitHub refused the PR) goes to the pass as it is, with no cook: its PR opens and it takes
  `in-pass`. Before this, the cook taken again on it found the work done, added nothing, and each try counted as a
  failure, until `hors-cuisine` (#2577: two cooks of 7 and 10 turns on a delivery whose PR never opened). The
  branch must be what the origin carries: a head that was never pushed, or a branch that already had a PR (sent back,
  closed), still gets a cook.
- **What a red CI says, handed to the cook.** The cook has no access to GitHub: told only that the CI of its PR is red,
  at best with the names of the red jobs, it rebuilt the CI's selection of tests and played it again to find what
  failed (#2545: 16 cooks taken again on a red CI, 93 min of cooking). The station now reads the failure annotations
  of each red check — the failing tests with their errors, which `.github/workflows/tests.yml` writes there, readable
  by the API where a job's log is not readable from the box — and adds them to the brief, under "What the CI says is
  red", check by check (`runtime/src/github-seul/ci-rouge/`). A check with no annotation is named with its address.
  Bounded: 12 checks read, 3,000 characters per message, 24,000 in all; the rest only named.
- **A delivery that changes what judges it** (`.claude/brigade/`, `.github/workflows/`, or the second judge's own
  brief, `JUGES` in `runtime/src/brigade-github.ts`) is not merged on the reviewer's approval alone: a cook must not
  turn itself green by weakening its own judge (#2555). Once the reviewer approves, and once its branch is up to date
  and its CI (or gates) green on its head, a **second judge** reads it: a launch separate from the review, in its own
  worktree, that reads neither the review nor its verdict, under `opus` / `high` whatever the reviewer's calibration,
  with the reviewer's read-only tools and the brief `agents/second-juge.md` — read from the running runtime, never
  from the delivery. It checks that no test is removed or skipped, no guard loosened, no gate bypassed, and that its
  ticket justifies the change (`runtime/src/second-juge.ts`). Its verdict is a PR comment
  (`<!-- brigade:second-judge … sha=… -->`) that holds for the head it read only. Approved, the delivery merges
  through the ordinary merge path; refused, it goes back to a cook with the judge's reasons, like a review that
  requests changes, and its next head is judged again. Nothing waits for the chef: no `blocked-on-human`, no
  "merge it by hand".
- **A red base** holds a delivery's merge only if that delivery runs the same check: a workflow that runs only on the
  base, like the Windows tests, never freezes the pass (#2279).
- **A project with no CI on its PRs** (espace since 2026-10-22, #2456) is judged by its own gates: when none of its
  workflows on the base (`.github/workflows/*.yml`, read by `runtime/src/declencheurs.ts`) runs on a PR that changes
  those files, an approved PR with no gates status on its head has `.claude/brigade/gates.sh` run on that head by a
  station, in a worktree of its branch, with the project's secrets, under a time cap (`BRIGADE_GATES_TIMEOUT_SECONDS`,
  30 min by default, `delaiDesGatesMs`), and the result is posted as the commit status `brigade/gates`
  (`github-etat/gates-de-la-tete.ts`). Green, the PR merges; red, what failed is written on the issue and the delivery
  goes back to a cook like a red CI. The `pending` status is the claim: a fresh one (under 90 min, `GATES_PERIMEES_MS`)
  is awaited, and one left by a station that died during the gates is taken over once it expires. A project with CI on
  its PRs keeps requiring it, and in doubt the CI is awaited.
- **An outside PR is judged, never merged** (#2933). A PR opened from a fork (`isCrossRepository` in the turn's
  snapshot, a head repository other than the project's in REST) is no ticket's PR, whatever its branch is called. A
  station fetches its head from `refs/pull/<n>/head` into a detached worktree, runs the review and the project's gates
  on it with none of the project's secrets and no GitHub token, posts the review verdict and the gates' result as one
  comment on the PR (`<!-- brigade:pr-externe … -->`), then a `merge-by-hand` TODO card on the PR, assigned to the
  project's `review` human: `merge #N?`, with `yes` recommended when the review approves and no gate is red, `no`
  otherwise. Nothing on this path can merge or update the PR (`runtime/src/pr-externe/`). One head is served once, by
  one station, claimed like the manager's work on an issue; a new head is judged again and its card replaces the
  previous one. The app's TODO lists issues only, so this card shows on GitHub, not in the app.
- **Cost follows events, not time** (#2198): a turn where nothing changed costs no counted GitHub call (its reads are
  conditional); a merge GitHub refuses, or a branch update it asked for, is not retried until the PR or the base
  changes. A ticket served end to end costs about 27 calls, at most 30 (`runtime/test/cout-par-ticket/`).
- **Guardrails.** The chef's stop, the breaker, the Max quota and the arbiter between projects hold a turn's launches
  (`github-seul/garde-fous/`, #2213). An open breaker is said on GitHub by an issue labelled `brigade:breaker-open`
  (`breaker-issue.ts`); a `/resume` comment on it by someone with write access closes the breaker at the next tick
  (`breaker-resume-github.ts`).
- **Stale branches.** The `cook/<n>-github` branches whose issue is closed are deleted, locally and on the origin, at
  each tick (`github-seul/elagage/`).
- **The manager runs on every station** that serves the project, and its work on an issue (qualify, calibrate,
  split, set aside, requalify) is claimed on GitHub like a ticket, one state of the issue at a time: the first claim
  wins, the others leave the issue alone until it is said done or expires (#2568,
  [manager](manager.md#several-stations-on-one-project)).
- **An epic is never a ticket** (#2618). An issue whose body carries `<!-- brigade:tickets -->` keeps `fire` and its
  `prio:`, but the turn neither claims it nor counts it among its tickets, so the held-kitchen diagnosis never sees it
  waiting; the manager rewrites its tally from GitHub on every turn and closes it once all its tickets are closed
  ([manager](manager.md)).
- **The chef's TODO** is facts on GitHub only: an issue labelled `chef-todo` with its marked comment
  (`github-seul/carte-todo/`), a PR awaiting the chef. The app reads them from GitHub; no runtime writes a board.
- **The chef is mentioned on each TODO card** (#2746). Every entry of the `awaiting` block of `status` that carries a
  ticket gets one comment on its issue that @-mentions the chef's login (the resolved chef, next item) and says the card's question on one line, so GitHub Mobile notifies the chef. The comment
  carries `<!-- brigade:chef-mention card=<key> -->`, keyed on the card's kind and question: the same card seen again —
  next tick, after a restart, by another station — finds it and writes nothing; a new question is a new mention. Kitchen
  traffic (claims, send-backs, verdicts, merges) never mentions the chef. With no chef resolved, nothing is mentioned and
  the station says so once (`runtime/src/mention-du-chef/`). Under a single GitHub identity that is the chef's own, GitHub
  does not notify the chef of their own comments: the per-role identities post as an app.
- **The chef is resolved by default** (#2928). In order: `chef` declared in `.claude/brigade/projet.json`
  ([settings](../reglages.md)), source `declared`; else the repository owner when the owner is a user, source
  `repo owner`; else — the owner is an organization — the author of the merged pull request that first added
  `.claude/brigade/gates.sh`, the `/brigade:init` one, source `set up by`. The kitchen resolves it at start and on each
  tick (what comes from GitHub is kept an hour; a GitHub failure keeps the last chef resolved and is said once) and
  writes it to `chef.json` in the state directory; `status` reads it back on its `chef` line — `<login> (<source>)`, or
  `none resolved — <why>` when there is none (an organization with no `/brigade:init` PR found), or `not resolved yet`
  before the kitchen has run (`runtime/src/chef/`).
- **A TODO card goes to the human whose role answers its question** (#2760). When the project settings declare
  `humans` (a list of `{login, roles}`, roles among `product`, `design`, `review`, `client-contact`), a product choice
  goes to the first declared `product` human, a design choice to the first `design` one, a delivery to review by hand
  to the first `review` one: the issue is assigned to them on GitHub and the mention names them instead of the chef. A
  card no role answers is assigned to the chef. Without `humans`, nothing changes: the chef is mentioned, no one is
  assigned (`runtime/src/aiguillage-humains/`).

## Running Brigade on an open-source project

An open-source project runs the same kitchen, with outside contributors who have no write access to its repository.
The mode is decided in epic #2927. Its outside PRs are in the runtime; the rest is decided and not yet in the runtime,
and says so below.

- **An outside PR is judged, never merged by the kitchen.** A PR opened from a fork is reviewed and gated by the
  kitchen, with none of the project's secrets, and its verdict is one comment on the PR (*An outside PR is judged, never
  merged*, above). The kitchen never merges it: a `merge #N?` card goes to the human with the `review` role, who merges
  it by hand, with `yes` recommended when the review approves and no gate is red. With no `review` human declared in the
  project's settings, the card goes to the chef.
- **A stranger's issue waits for a human.** Decided, not yet in the runtime: an issue opened by someone outside the
  project gets a triage proposal from the manager and a TODO card for the `product` human. Nothing reaches the rail until
  that human answers.
- **A contributor station runs from a fork.** Decided, not yet in the runtime: a contributor without write access runs a
  station from a fork, claims a ticket, and delivers an outside PR, which the path above judges.
- **The chef can refuse a contributor station** (#2936). The refused stations are a list in the state directory
  (`stations-refusees.json`, `runtime/src/station-contributrice/refus.ts`): only the `chef` role changes it, and a file
  that cannot be read is an error, never an empty list. A contributor station reads it at each turn: a refused station
  claims nothing (no claim comment is posted), and one whose list cannot be read takes nothing that turn. The command
  `contributor-stations` lists the stations that claimed a ticket in the last 30 days (their claim comments) plus the
  refused ones, and `refuse <station>` / `accept <station>` change the list; Settings in the app calls it. The list lives
  in the state directory of the kitchen that holds it: it binds the stations that read that directory.

## What is gone (#2061)

The code that gave one station the kitchen of a project is removed from the runtime. Nothing takes a ticket from the log any more:

- the station of the log (`station.ts` keeps only its configuration), its worktree cleanup, and the remote stations it
  served under leases (`distantes.ts`, `superviseur-distant.ts`, the `remote.asked` events);
- the claim relay through the stations' gists, and the Kitchen board: its writer, its gestures and mentions, its
  single-writer guard (`tableau/`, `board-single-writer.ts`). The board issue (#1683) is no longer written; it can be
  closed. The app no longer reads it either: its rail view, TODO, backlog and the second's queue read the project's
  issues, labels and PRs (`app/src/tableau/lecture.ts`), and the gestures it posted there are gone — the ones that
  have a fact on GitHub write it (`fire` or `waiting` removed, a comment on the ticket's issue,
  `app/src/gestes-github.ts`), the others say where to do it ([app](../app.md));
- the rail feeding from GitHub (`alimenter.ts` keeps only the repository settings and `prio:`), the lease API of the
  log's rail (`rail.ts` keeps only its words), and the old pass (`pass.ts`) with the PR deliveries that relied on it:
  the lessons notebook, the rename of a pause, the settings PR, the correction PR;
- the old-path loops and their `perimee` switch: the closer run, the product role's cadence, the manager's reactions to
  the old pass and station (reaction, triage, no capacity).

The log stays: it keeps the chef's decisions, the guardrails, the sessions and the measures, and its old rail and pass
stay readable as history (`status`, `facts`). Nothing feeds that rail any more and nothing takes a ticket from it: the
box commands that still write rail facts (`rail`, `waiting`, `pass`) only change that history.
