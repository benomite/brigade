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
- **A ticket whose gates cannot run on a station goes to another station of the project.** When the cook's block
  says, in one sentence, that the gates or tests cannot run on its station for lack of a dependency, a command or a local
  service (`gatesInjouables`, `runtime/src/routage-station/routage-station.ts`), the station posts
  `<!-- brigade:station-incapable station=<name> -->` on the issue with the cook's words and gives the ticket back,
  not counted among its tries, without the manager. A station never takes a ticket that marks it unable: its claim
  gate skips it, and another station of the project takes it: the stations the station declares, plus those GitHub shows
  (a claim comment on an issue that moved in the last two days, read at most every ten minutes) — a Mac station declares
  only itself, and the box that serves the same project is seen there (#3870). The station also writes, in one line, what
  it lacked (`<BRIGADE_STATION_DIR>/lacunes/<project>.json`, until it delivers a ticket): `facts` carries it as `lacks`
  and its card in the Stations tab says it. When the
  project has no other station that is not marked, the ticket stays on the rail, held on that station: the station's log
  and its skip line say the station is to be fixed — no `blocked-on-human`, no TODO card. The marks count since the
  ticket's last removal of `fire` or `served-elsewhere`: putting it back on the rail clears them. Seen on mirrorlab#674 (#3057).
- **The manager answers a technical block; only a product or design decision reaches the chef.** The station runs the
  manager — its calibration, the reviewer's read-only tools, in a worktree of the ticket's branch — on the cook's question
  and its previous answers on this ticket (`runtime/src/blocage-au-manager.ts`). A technical question — a tool, a path, a
  repository, a choice between technical options, an access the kitchen has — is answered on the issue
  (`<!-- brigade:reponse-au-blocage n=… -->`: the cook's question, the answer, the decision taken) and the ticket goes
  back to a cook from its branch, with no `blocked-on-human` and not counted among its tries. A product or design
  question sets `blocked-on-human`, the comment opening on the question in one line
  (`**Question for the chef (product):** …`); a gesture only the chef can make sets it too, the comment opening on the
  exact gesture (`**Gesture for the chef:** …`). A gesture that needs a secret or an account on the station — an API
  key, a database URL, a password, an account or a login to open (`runtime/src/besoin-de-secret.ts`) — is that card,
  its head saying so (`**Gesture for the chef (secret or account):** …`): posted once, never read as a git gesture even
  when the cook's words also name its branch, and the ticket is not relaunched while it waits under `blocked-on-human`.
  Seen on BOBL-tech/mirrorlab #894, taken 10 times (#4041). Other gestures stay as they were — unless that gesture is a `gh` command the station makes itself with
  its GitHub access: `gh issue create`, `gh issue|pr comment`, `gh issue|pr edit --add-label|--remove-label`,
  `gh run rerun` (`runtime/src/geste-station/`). The station makes it, posts the result (the new issue's number…) on
  the ticket, where the resuming cook reads it, removes `blocked-on-human`, and the ticket goes back to a cook — no
  card. A GitHub call that fails counts as a cook without a delivery, its error written on the ticket (`brigade:echec`),
  never a card asking the chef to run the command. Seen on 2026-11-10 (#3136). The issues a cook asks to open, the
  manager lists in `issues_a_ouvrir`, each with the cook's title and body and what it tracks: the station opens them all
  and posts one line `#<number> = <what it tracks>` per issue. A placeholder title or body (`<title>`, `<body>`), or a
  `gh` gesture of these kinds the station cannot read whole (“run `gh issue create` five times”), opens nothing and
  counts as a cook without a delivery, the reason in one line — never a card (#3374). After two technical answers, the third block goes back to the manager
  with both answers, and its decision is appended to the ticket's body once (`<!-- brigade:decision-du-manager -->`);
  a block on a ticket that already carries it, or a decision the station cannot write, counts as a cook without a
  delivery (`brigade:echec`), so `ECHECS_MAX` bounds it. A manager that cannot answer — its run fails, its answer is
  unreadable — sends nothing to the chef: the ticket waits (`brigade:attente … manager`), then
  is retried; the third such wait since the ticket was last relaunched counts as a cook without a delivery. Seen on #2875 (#2894).
- **A ticket only a human can do is taken by that human, on the same rail** (#4276, rule 6 of the
  [simplified process](../superpowers/specs/2026-11-24-simplified-process.md)). The chef marks it with
  `rail human <ticket> [who]` (`runtime/src/sortie-attente-capacite/sortie.ts`, `runtime/src/cook-humain/`): the issue
  gets the label `human-cook`, its assignee — the login the chef names, or the repository's owner for the chef (an
  organisation is refused: name who takes it) —, and one comment telling that person the ticket is their work and the
  branch to open their pull request from (`cook/<n>-github`). The ticket keeps `fire` and its task enters the chef's TODO
  with the assignee's name; marked again for someone else, the previous assignee is removed. No station takes a ticket
  that carries `human-cook`. When its pull request is open, the station sets `in-pass`, as at a cook's delivery, and the
  same pass judges it: review, gates, CI, then merge, in the same order, nothing skipped
  (`runtime/src/cook-humain/livraison.ts`). `npm --prefix runtime run human-cooks` lists every open ticket marked
  `human-cook` with its assignee, then the address of the same list on GitHub; a ticket leaves it when it closes or
  loses the label.
- **A station with no manager posts the cook's question for a manager on another station** (#3938,
  `runtime/src/manager/question-sans-manager.ts`). It posts the question on the issue
  (`<!-- brigade:question-au-manager station=<name> -->`) and gives the ticket back. A station runs a manager when GitHub
  shows its claim of the manager's work (`brigade:manager-prise`) on an issue that moved in the last two days, read like
  the stations of the project below. While another station of the project runs one, the station with no manager does not
  take the ticket back: that station takes it, and gives the question to its manager before any cook
  (`<!-- brigade:question-reprise station=<name> -->`); the answer is written on the issue, where the next cook reads it.
  A station that the issue marks as unable to run the ticket's gates never takes it, so the question does not wait for
  its manager. When no other station of the project that can take the ticket runs a manager, or they cannot be read, the ticket is given back to the rail and waits
  (`brigade:attente`), then a cook resumes it. A missing manager is never a failed cook and never sets a ticket aside:
  on BOBL-tech/mirrorlab#842, two such stops set the ticket aside for 21 h, when another station's manager could answer.
- **The kitchen keeps a cook branch up to date with `origin/<base>`.** A new branch starts from the base the station
  has just fetched. Before a cook resumes an existing branch, the station fetches the base in its worktree and merges it
  into the branch if the branch does not hold its tip (a branch whose PR is in conflict follows the conflict send-back
  instead, #2953). A merge that stops on conflicts is attempted again without a commit and left to the cook, conflict
  markers in place, its brief naming the files: it resolves them in its own branch, runs the gates and goes on (#3476).
  A merge that fails otherwise is undone, the station warns, and the cook starts from its branch as is. When a cook blocks because it needs commits that are on the base and not on its branch, the station
  commits what the cook left, fetches and merges `origin/<base>` into the branch, and gives the ticket back to a cook
  from it, not counted among its tries. If it cannot — conflict, refusal, network —, the merge is undone and the
  ticket goes back to its own cook with a `brigade:conflit-main` comment that lists the conflicting files: never a new
  ticket (#3476). A branch that already holds the tip leaves the question to the paths above. No TODO card,
  never `blocked-on-human` (`runtime/src/mise-a-jour-branche/`). Seen on #2910, #2914 and #2915 (#3001).
- **A conflict with the base goes back to the ticket's own cook, never to a new ticket or the chef.** A cook that
  blocks while it resolves a conflict with the base gets the ticket back when its question is a git gesture, a
  technical question or a gesture the manager reads, the conflict still named; only a product or design choice the
  manager reads in it reaches the chef, on a card that asks that choice in product terms, never a merge, a rebase, a
  conflict resolution or a push. Off the conflict path too, a gesture the manager reads as git sends the ticket back to
  its own cook instead of a card. GitHub's client refuses to open an issue whose work is to change another ticket's
  branch (its title names `cook/<n>-…`, or a git gesture of `#n` names that branch). At each turn, the station undoes
  what the old path left: such an open ticket is closed and folded into its owner's send-back, with the files it named;
  a `blocked-on-human` card asking the chef for a git gesture is withdrawn and the ticket it names goes back to its own
  cook (`runtime/src/conflit-main/`) — never a card that asks for a secret or an account, even when it names a cook's
  branch (#4041). Seen on benomite/secondes #18/#28 (#3476).
- **A red cook PR held for the chef goes back to a cook.** At each turn's healing, an open PR on a `cook/<n>-github`
  branch whose head has a red check, and whose ticket is on the rail and held for the chef (`blocked-on-human`,
  `chef-todo`) with no cook on it — not cooking on this station, not `taken`, not `in-pass` (the pass sends its own
  red back), not set aside (`served-elsewhere`, `set-aside:failures`: the supervisor's), not `waiting` —, is sent back: the hold labels are removed, then a
  `brigade:renvoi … sha=<sha> ci-rouge` comment names the red checks, and the ticket is free for a cook from its
  branch (`runtime/src/ci-rouge/ci-rouge.ts`). A head is sent back once by this path; the send-back counts among the
  ticket's `RENVOIS_MAX`. A green, pending or check-less CI, a free ticket, or another branch is left alone; open
  PRs are read only when a held ticket exists. A CI or head that cannot be read sends nothing back and is warned.
  Seen on #2908, whose red CI ended as a "merge it" request to the chef (#2970).
- **The breaker issue is never a ticket of a project** (#3620). The only issue a station opens about the kitchen
  itself is the breaker issue: its `<!-- brigade:breaker-open … -->` mark, the `brigade:breaker-open` label, or the
  title the station gives it. Even fired and calibrated, it is never judged nor cooked: the turn leaves it out before
  anything reads its tickets, so no cook takes it (`runtime/src/issue-de-la-cuisine.ts`). Seen on benomite/secondes
  #46. The idle-kitchen bug the turn filed on `benomite/brigade` is gone (#3945): a kitchen where nothing merges wakes
  the [supervisor](#the-supervisor).
- **The rail's invariants are checked on every turn** (#4026, `runtime/src/invariants/`,
  [spec](../superpowers/specs/2026-11-23-autonomy-trust-control.md), A1). Before any other gesture of the turn, the
  station checks four sentences, each once. When one breaks, it is repaired with a gesture the supervisor already has,
  and a comment on the ticket (`<!-- brigade:invariant n=<k> … -->`) says which invariant broke and what was done —
  once per break. The turn that runs them is `tour` in `runtime/src/brigade-github.ts`, through
  `controleurDesInvariants` (`runtime/src/invariants/invariants.ts`); `runtime/src/superviseur/tour.ts` only observes
  that turn for the supervisor. No gesture is added: invariants 3 and 4 play `waiting` (its mark), `back-on-rail` and
  `rerun` (`runtime/src/superviseur/gestes.ts`); invariant 1 needs no write — the claim gate stops counting the PR —
  and invariant 2 stops the ticket the way its last failed try does (to the manager, or `set-aside:failures`, which
  hands it to the supervisor, and WAITING with its reason — #4041), the closest the rail has, as none of the six gestures stops a ticket:
  1. a ticket no cook cooks and not in pass holds no file zone and reserves none: an open PR whose ticket is free,
     set aside, in WAITING or `taken` with no readable claim no longer holds the zone of the tickets waiting for it —
     an epic's PR included, whatever its body says (#3979, #3932). The claim gate reads the same rule (`tientSaZone`);
  2. the same failure on the same commit is never judged nor relaunched twice: a cook's failure names the PR head it
     started from and left unchanged (`<!-- brigade:echec n=… sha=<head> -->`), and a ticket relaunched once on that
     head is stopped there — it goes to the manager, or is set aside (`set-aside:failures`) — instead of being
     relaunched (#4001). A head is judged once already (#3961);
  3. a ticket set aside, parked or in WAITING has a named reason and a date to look at it again: without a WAITING
     mark, the supervisor adds one (the reason the kitchen gave, by `the supervisor`, follow-up in seven days, back on
     the rail on its own); past that date, a WAITING ticket comes back as the kitchen's do, and a ticket set aside is
     put back on the rail (the `back-on-rail` gesture);
  4. a red check on `main` is rerun once before anything else (the `rerun` gesture, for GitHub Actions jobs): the
     turn that reruns it does nothing else, nor do the turns while the rerun runs (30 min at most). A check rerun
     once is not rerun again. Said in the service log: a red base has no ticket.
- **The supervisor reads what the claim gate said** (#3699). Every line the claim gate gives for a cookable ticket it
  skips — a ticket it waits for, a missing capability, a card with no zone, the wait after a stop — is kept by the
  turn, and its dossier carries them ([the supervisor](#the-supervisor)).
- **A TODO card that asks no question is filed as a defect on benomite/brigade.** At each turn's healing, a ticket of
  the turn (`fire`) that carries `chef-todo` with no marked comment `<!-- brigade:todo kind=… -->` from the repository,
  or one whose text is empty, is reported with no action from the chef: a `fix` issue on `benomite/brigade` names the
  project, the ticket number and what is missing, and carries `<!-- brigade:carte-sans-question <repo>#<n> -->`. An
  issue of the brigade that carries that mark — open or closed, changed within 30 days, from the repository or from
  this station's account — covers the card: no second one. A brigade that cannot be read files nothing and is
  warned; the next turn tries again (`runtime/src/signalement-carte-sans-question.ts`, #3134).
- **No step writes acceptance tests before the cook** (#4229, epic #4132). The cook writes its tests with its work, in the
  same pull request, and the review judges them (`agents/cook.md`). Nothing freezes a test: a cook may change any test
  file of its own branch. The app's rail still reads the `tests-written` label of a ticket that went through the former
  step, as `tests written` (`app/src/vue/rail/github.ts`).
- **Every 2 minutes** (#2296), a turn takes, cooks, reviews and merges. Each turn reads its tickets, the open PRs with their CI, files and mergeability,
  and the base's CI in one GraphQL query (#2301), and falls back to REST for that turn when the query fails.
  A ticket the manager makes claimable — it lays `fire` or the calibration, or fires a ticket of a split — brings a
  turn at once on the station that runs it (#2796): before, the ticket waited for its claim until the next interval, up
  to 2 minutes of every manager-qualified ticket's lost time. So does a cook that ends without a delivery, once its
  ticket is given back (its place is free), and a merge (a dependency, a held zone or a pass place may be free): the
  rail is read again at once, not at the interval nor 30 s later (#2802) — on the computer's station too, whose loop
  waited the 30 s until #2832 ([diagnosis](claim-wait-2026-11-07.md)).
- **At most 5 deliveries in pass** (`PASS_MAX`, #2300): while the project has 5 or more tickets `in-pass`, no station
  takes a new ticket. A ticket sent back from the pass to a cook leaves it in the very turn it is sent back. A delivery
  the pass holds for the chef — the validation of its screen, the review of a sensitive ticket — takes no place while
  its head is the one held: it waits for a human, not for the pass, and counted, five deliveries waiting for the chef
  stopped every claim of the project until he answered (#3446, [diagnosis](claim-wait-2026-11-13.md)). Nor does it
  hold its zone at the claim gate ([station-cook.md](station-cook.md), #3677).
- **A full stop says so.** When the places or the pass are full, the claim gate stops; each claimable ticket it leaves
  says which bound holds it, and by which tickets — `the station's 6 places are all taken (#3643, #3649, …)`, `the
  pass holds 5 deliveries, its most is 5 (#3601, …)` — unless it waits for an open ticket, which it names instead
  (#3647). These lines are what the supervisor's dossier carries; before #3677 these two stops said nothing
  ([diagnosis](claim-wait-2026-11-15.md)).
- **A cook that says the ticket cannot be done yet puts it in WAITING** (#3814, `runtime/src/attente/`). On
  BOBL-tech/mirrorlab, #824 could only be done from 2026-11-25: each cook said "Too early", the review asked for changes,
  and the kitchen relaunched it about every 3 minutes for 26 h (1,198 runs) while its zone held #803; the second put it
  in WAITING by hand. Now the station parks it (#4129), with no chef gesture:
  - a cook that stops blocked (`<bloque>`) on a date to come ("cannot be done before 2026-11-25", "too early", "only
    from …"), or on something a third party outside the kitchen has not given ("waiting for the client", "nothing in
    the kitchen can produce it"), parks the ticket through the same marks as the chef's park: the `parked`
    label and the `<!-- brigade:parked … -->` comment, with who, for what, and the date taken from its words
    (the date it says; without one, seven days). Any other question goes to the manager, as before, and so does this
    one when GitHub refuses the parking: the station says why;
  - a delivery the review hands back twice in a row with the same result is not relaunched a third time as it stands:
    if that result says the ticket cannot be done yet, it is parked the same way — the gesture first, then the
    send-back comment, so a refused gesture is tried again at the next turn; otherwise its sends back are
    spent and it goes to the manager (rework, or set aside with its reason). A red CI keeps its own count;
  - a parked ticket holds no file zone, even with an open PR: the ticket behind it starts;
  - an open PR holds a file zone only while it is alive (#4242, `runtime/src/claim-gate.ts`): its ticket is in cook
    or at the pass, or the PR had activity (commit, comment, review, update — its `updatedAt`) within the stale delay,
    `STALE_DELAY_MS`, 12 hours. A PR whose changes are already on the base (each of its files has the same content on
    the base as on its head) holds nothing, nor does a PR labelled `zone-released`. An activity that cannot be read,
    or a base that cannot be compared, keeps the zone held. A ticket skipped for a PR says it in one line, the PR
    number and why the PR is alive (`zone held by open PR #4077 (last activity …, within the 12 h stale delay)`), and
    the skip carries the reason code `zone-held` with the PR number. On 2026-11-24, a forgotten open PR (PR 4077)
    held the README zone for an hour and the claim gate skipped the only cookable ticket (#4061);
  - on its date, a ticket parked until a date resumes exactly where it was by itself — `parked` removed, nothing
    else, a comment that says so — whoever parked it. Parked until a fact, or for the chef, it stays until someone
    unparks it. The turn reads each parked ticket's comments once, for this return;
  - the chef's TODO (the `awaiting` block) lists each ticket parked for someone else with its date, without
    counting it as a decision for the chef. The second's queue also lists the `parked` issues; the app, which reads
    each project every thirty seconds, keeps to the parked tickets of the lists it already reads.
- **Places.** A station never holds more tickets than its places; a cook that fails keeps its place until the turn
  gives its ticket back on the issue, and at its first turn a restarted station gives back the tickets it held with no
  cook (#2179). Its places are read again at each turn: the cap the chef sets live (`station -- cooks <N>`, `0` for no
  limit) once he has set one, otherwise its declared cap bounded by its machine's cores — 6 on 8 cores (#3560). At start the
  station announces itself in the log (`station.announced`, with its declaration and its cores), so `status` and
  `station` say its cap and where it comes from. Until #3446 the places were fixed at start and the chef's cap was
  written but read by nothing ([diagnosis](claim-wait-2026-11-13.md)).
- **A `taken` ticket with no cook and no wait returns to the rail** (#3883, `runtime/src/reprise-attente/`). A timed
  wait lives on the issue, not in a station's memory: its date is the `until=` of the `brigade:attente` comment, read
  again at every turn, so a restart neither loses a wait nor its date passing. At each turn, a station looks at every
  `taken` ticket with no cook on it here. No cook runs on it on any station when this station holds it, when a wait
  follows the holding claim (the cook of that claim stopped), or when the claim is older than a cook can live
  (`COOK_LE_PLUS_LONG_MS`, 6 hours). Seen so, with no live wait, for more than 5 minutes (`ORPHELIN_APRES_MS`), the
  ticket loses `taken`: the station releases the claim in the name of the station that held it, with a comment that
  says the ticket was taken with no cook on any station and no wait, and that it returns to the rail. From that turn
  it no longer holds its zone. On 2026-11-19, #3764 kept `taken` on a timed wait for over two hours across two
  restarts of its station, and the claim gate skipped #3761 and #3786 as "zone held by #3764".
- **The machine.** It holds no take and no launch: a saturated machine is only said (`station.saturated`, thresholds
  in [station.md](station.md)), and the places of the station, the cores' default of one cook per core past the two
  kept (#3560), bound its cooks (#4285).
  When the disk is the lack, no cook runs, and what the kitchen holds itself (the size of its state directory) could
  not bring the free space back to the floor, the chef gets one TODO card on an issue of its own
  (`<!-- brigade:disk-full -->`): the figures and the biggest consumers on the volume, if `du` reads them. It is
  not raised while that reclaim could still be enough, nor twice for the same state, and it is lifted once the disk
  has room (#4091).
- **The watchdog of a stalled kitchen** (#4213, `runtime/src/veille-blocage/`). At each wake of a project's runtime,
  next to the supervisor: when nothing has merged for one hour (`DELAI_SANS_LIVRAISON_MS`, counted like the
  supervisor's 30 min, from the later of the last merge and the oldest waiting ticket) while at least one ticket
  waits, and the kitchen is neither stopped nor switched off, it reads the machine (load per core, cooks of the
  station in flight, what the claim gate skipped, tickets taken three times without delivering, the leftovers of
  exited cooks, the disk) and decides one cause. Leftovers of exited cooks (orphaned processes, worktrees, run files
  and tmp dirs, read as the reclaim above reads them, without the npm cache) are repaired at once, with one line in the
  service log naming the cause and the action. A full disk, or a machine over its load per core with no cook of the
  station in flight, needs a human: one TODO card (`blocked`) in plain words — the disk's on the disk issue above,
  shared with it, the load's on the first waiting ticket — and no second card while the cause lasts, across restarts
  (`<state>/veille-blocage.json`). Each card posted, by the watchdog or by the disk guard above, is a machine outage
  that reached the chef, noted with its date; the watchdog's line and the disk guard's say how many there were in the
  last 7 days. With
  no machine cause, it says so once, and the tickets stay with the supervisor.
- **A word to a cooking cook** (#4047, `runtime/src/mot-au-cook/`). `send-word <owner>/<repo>#<ticket> <word…>`
  answers `{"ok":true}` or `{"ok":false,"reason":"…"}` on one line. It reads the issue: a ticket that is not `taken`
  (in pass, closed, unknown, queued, waiting) is refused with the reason, and nothing is posted or queued. A `taken`
  ticket gets the word as a comment (`<!-- brigade:mot-au-cook -->`), which stays for the pass and later cooks, and in
  its queue under the state directory (`mots-au-cook/<ticket>.jsonl`). The station never cuts the cook's turn: when
  the cook's `claude` ends without a stop, the station takes the queue, and if a word is there it resumes the cook's
  session (`--resume`) for one more turn whose input carries it. A turn that did not finish, or a session that cannot
  be read, leaves the word for the input of the ticket's next cook launch; a resumed turn that does not finish leaves
  the delivery as the turn before it left it. A Codex cook gets no word.
- **A cook that adds nothing.** A cook that resumes a ticket's branch and ends without moving its head delivered
  nothing: it counts as a cook without delivery (`ECHECS_MAX`), so a ticket cannot loop between the cook and a pass
  that already sent that head back (#2372) — unless its PR is open and conflicting with the base or red (#2454): the
  cook is then told in its brief to bring the branch up to date (or start again from the base), and if it still adds
  nothing the ticket is given back with a comment, uncounted, since that is work left, not a failed cook.
- **Sends back are counted per ticket** (#3961). The count is read from the ticket's `brigade:renvoi` comments and
  survives relaunches: removing `served-elsewhere` or `set-aside:failures` no longer restarts it at 1/2 (on 2026-11-20,
  #3955 went "send-back 3", "relaunch 2", then "send-back 1" on the same commit). Only the manager's rework at the limit
  (#3513) starts it again. Set aside at its last send-back, a ticket is never relaunched to a cook by the kitchen: the
  manager or the chef decides.
- **A cook that disagrees with the review.** Sent back on review remarks, a cook that judges them already addressed or
  wrong replies on the PR instead of ending silently: its brief tells it to write the reply in its last message between
  `<reponse-pr>` tags, and the station posts it on the PR (`brigade:reponse-cook sha=…`), since the cook has no GitHub
  access. A stop that adds nothing but carries such a reply, posted since the send-back, is a disagreement, not a
  failure: the delivery goes back to the pass as is (#2592). A head the review already refused is never reviewed again,
  reply or not: its verdict records the judged pair, the head and its reason, and the same head comes back with the same
  reason. It is sent back again on that reason, and that send-back counts among the `RENVOIS_MAX`, so a disagreement
  cannot loop (#3961: #3955 looped about 15 times between cook and review on one commit). A head never reviewed — sent
  back for a red CI — is reviewed with the reply in its brief.
- **A delivery cut before its PR.** A branch the station pushed but that never had a PR (the station stopped between
  the push and the PR, or GitHub refused the PR) goes to the pass as it is, with no cook: its PR opens and it takes
  `in-pass`. Before this, the cook taken again on it found the work done, added nothing, and each try counted as a
  failure, until `served-elsewhere` (#2577: two cooks of 7 and 10 turns on a delivery whose PR never opened). The
  branch must be what the origin carries: a head that was never pushed, or a branch that already had a PR (sent back,
  closed), still gets a cook. A head found only in the clone is pushed first, and only once the station's gates are
  green on it; red, it is not pushed, and a cook resumes it with what they say (#3996).
- **What a red CI says, handed to the cook.** The cook has no access to GitHub: told only that the CI of its PR is red,
  at best with the names of the red jobs, it rebuilt the CI's selection of tests and played it again to find what
  failed (#2545: 16 cooks taken again on a red CI, 93 min of cooking). The station now reads the failure annotations
  of each red check — the failing tests with their errors, which `.github/workflows/tests.yml` writes there, readable
  by the API where a job's log is not readable from the box — and adds them to the brief, under "What the CI says is
  red", check by check (`runtime/src/github-seul/ci-rouge/`). A check with no annotation is named with its address.
  Bounded: 12 checks read, 3,000 characters per message, 24,000 in all; the rest only named.
  A check whose annotations name no file — a step that runs lint, format, type check and tests at once writes only
  `Process completed with exit code 1.` — is also given with the end of its job's log, read by the API
  (`journalDuCheck`), cut as the supervisor's dossier cuts it (`sortieDErreur`,
  `runtime/src/checks-de-la-branche.ts`): without it the cook did not know which gate
  was red and pushed again blindly (#3806: 11 red CIs on BOBL-tech/mirrorlab#787). An unreadable log leaves the
  check said by its annotations alone (`runtime/src/brief-renvoi.ts`).
  The send-back comment names each red check with the failed steps of its GitHub Actions job, read by the API
  (`etapesEnEchec`, `runtime/src/github.ts`, #3028): `Lint + Format + Typecheck + Tests (failed step: Format)`.
  A job that runs several steps does not say by its name which one is red. A check that is not a job, or whose
  steps GitHub does not return, is named alone, as before; a read that fails is said in the station's warnings,
  and the send-back still goes. The `brigade/gates` status of a project with no CI on its PRs is named with what
  made its gates red, as its status sums it up — their first `FAIL` line, or their cut (#3157):
  `brigade/gates (failed step: tests du runtime en échec)`.
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
- **Gates that run nothing never pass a delivery** (#3188). Before running the gates of a PR's head (or of the base, to
  confirm a cook's "already served" claim), the station reads the tree's `gates.sh` and `CLAUDE.md`. The gates run
  nothing when `gates.sh` launches no command (only comments, `set`, `cd`, assignments, `:`, `true` or an `exit`), or
  when `CLAUDE.md` carries the `**Gates provisoires**` binding that `/brigade:init` writes on a new project
  (`commands/init.md`, step 5). Then the station reads the repository's issues labelled `foundation`: while one is open,
  no delivery but its own is merged, and the station says why ("nothing checked — the gates run nothing until the
  foundation ticket #n is merged"), posts no status and retries like any gates not run. The foundation ticket's own
  delivery is not held: the gates it brings run on its branch and the review judges it. Once it is closed, gates that
  launch a command are the real ones and judge every delivery, binding forgotten or not; a `gates.sh` with no command
  still reports "nothing checked — the gates run no test command", never green, and so does the binding with no
  `foundation` ticket ever filed (`runtime/src/fondation/fondation.ts`).
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
  changes. A ticket served end to end costs about 27 calls, at most 31 (`runtime/test/cout-par-ticket/`).
- **Leftover PRs** (#3097): at most every ten minutes, a turn closes each open PR whose ticket (`cook/<n>-…` branch) is closed, with one comment — `its ticket #N was closed on <date>; nothing serves this PR any more` — and keeps its branch. The comment is read before it is posted, so a failed close does not double it on the next pass. A PR from a fork is never closed.
- **Guardrails.** The chef's stop, the breaker, the Max quota and the arbiter between projects hold a turn's launches
  (`github-seul/garde-fous/`, #2213). An open breaker files no GitHub issue and no chef gesture closes it: the supervisor
  re-runs the check that tripped it and closes it (`manager/supervision.ts`, #3911; see `garde-fous.md`).
- **Stale branches.** The `cook/<n>-github` branches whose issue is closed are deleted, locally and on the origin, at
  each tick (`github-seul/elagage/`).
- **The manager runs on every station** that serves the project, and its work on an issue (qualify, calibrate,
  split, set aside, requalify) is claimed on GitHub like a ticket, one state of the issue at a time: the first claim
  wins, the others leave the issue alone until it is said done or expires (#2568,
  [manager](manager.md#several-stations-on-one-project)).
- **An epic is never a ticket** (#2618). An issue whose body carries `<!-- brigade:tickets -->` keeps `fire` and its
  `prio:`, but the turn neither claims it nor counts it among its tickets; the manager rewrites its tally from GitHub on every turn and closes it once all its tickets are closed
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
- **A TODO card is answered by replying to its comment on GitHub** (#3253). The mention comment says so on its last
  line. The kitchen reads the comments of every issue that has a card in the chef's queue at each runtime tick (60 s by
  default), and a comment answers a question when it is not a bot's nor the kitchen's (a `<!-- brigade:` line that is
  not quoted, or its own answer comment) and comes after the question's comment. It answers the question its leading
  `>` quote block reproduces (GitHub's "Quote reply"); with no quote, the only open question, or the oldest open one
  when the issue has several. A quote that reproduces no open question is no reply. The text left once the quote is
  removed is one of the card's choices (whitespace and case ignored) and is recorded as that choice, as if clicked in
  the app, or else is recorded as the chef's own words. The author must be the chef, or the declared human whose role
  answers the card's question (the routing above); anyone else is ignored and the card stays in TODO. A question that
  already has an answer from a comment (`todo.answered` carries its card key as `question`) is not reopened by a later
  comment. A question is open while its card is in the queue and its marked comment is on the issue
  (`runtime/src/reponse-par-commentaire/`).
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

## The supervisor

When the kitchen does not move, the project's manager is woken to look and act (#3945,
[spec](../superpowers/specs/2026-11-20-kitchen-spinning.md), section B). It replaces the held kitchen, the
emergency, the stuck-rail line, the idle-kitchen bug, the loop tickets and the automatic repair-main tickets, all
deleted. `runtime/src/superviseur/brancher.ts` wires it into both entry points, `main.ts` and `station/cuisine.ts`.

- **What wakes it.** On each wake of the runtime it reads what the GitHub-only turn observed (`superviseur/tour.ts`
  wraps the turn's GitHub client): the last merge, the cookable tickets and since when, the takes without delivery
  read from the station's `<!-- brigade:echec n=… -->` comments, `main` red since when. It fires
  (`superviseur/declencheur.ts`) when nothing merged for 30 min while a ticket is cookable, when a ticket was taken 3
  times without delivering, or when `main` has been red for 10 min. One run per project at a time; the same cause
  starts no new run before 30 min (`REVEIL_REPRIS_MS`).
- **No progress on a ticket** (#4027, [spec](../superpowers/specs/2026-11-23-autonomy-trust-control.md), section A2).
  A ticket with no progress for 30 minutes wakes the supervisor too, whatever its state: cooking (`taken`), in pass
  (`in-pass`), set aside (`set-aside:failures`, `served-elsewhere`), parked (`blocked-on-human`, `chef-todo`) or
  WAITING (`waiting`). Progress is a new commit (a new head of the ticket's PR), a CI result (the concluded checks of
  that head change), a review verdict (`brigade:verdict` posted on its PR) or a label change by an agent (a supervisor
  gesture). The labels the station sets or removes, and a human's, do not count. The count starts from the last
  progress, or from the turn that first saw the ticket in one of these states; a ticket that leaves them forgets it.
  It wakes the supervisor once per silent period: the next wake needs a new 30 minutes without progress. The wake
  writes its reason on the ticket (`<!-- brigade:no-progress since=… -->`), with the date of the last progress, and
  the manager receives the cause `no-progress`. A run that already holds the project delays the wake to the next
  turn. The code is in `runtime/src/inactivite/`, wired into `superviseur/tour.ts` and `superviseur/brancher.ts`.
- **What it does not supervise.** A kitchen stopped by the chef (`stop`) or switched off. Without a manager
  calibration — no manager given by the station — nothing is launched.
- **The run.** The project's manager is launched, read-only, in a worktree of the base, with the supervisor's brief
  and its dossier: the queue, the tail of the log, the failing CI step and its log lines, the history of the ticket
  at fault, the supervisor's last ten gestures and counters (its gesture log, [`autonomie.md`](autonomie.md)), and what
  the claim gate said of the cookable tickets it skipped. It answers one JSON object. Only six
  gestures are played (`superviseur/gestes.ts`): rerun the failed CI jobs; back on the rail with a note; WAITING for a
  named third party; close a duplicate; file ONE `fix` ticket for a new cause, after checking that no open ticket
  carries the same cause mark; a TODO card, only for a product or design question. The run writes one comment on the
  ticket it acted on, and each gesture done enters the supervisor's gesture log. A run that fails is said in the station's service log
  (`supervisor on <project>: its run failed — …`).
- **A red base.** A `fix` for a red check of the base requires the check's failed jobs to have been re-run first
  (the rerun gesture) and to be still red. It carries `fire`, `prio:0`, `model:opus`, `effort:medium`, `fix` and the
  mark `<!-- brigade:supervisor-cause check:<check name> -->`. That mark with `prio:0` makes it a repair
  (`estUneReparation`, `runtime/src/reparation.ts`): the only delivery judged and merged on a red base, and what the
  quality figures count as a repair. The GitHub-only turn reruns a red check of the base once, first (invariant 4,
  #4026); it opens or closes no repair ticket, and a red base still holds merges as before.
- **A set-aside ticket.** The healing turn leaves a ticket set aside for its failures (`set-aside:failures`) where it
  is, and `runtime/src/manager/supervision.ts` hands it to the supervisor, which answers with one of its closed list of
  gestures (#3911). It is not parked for ever: it carries a date to look at it again, and past that date it is put
  back on the rail (invariant 3, #4026).
- **A zone held by a stale PR** (#4243, `superviseur/zone-liberee.ts`). The claim gate no longer counts an open PR
  that is stale (#4242, `claim-gate.ts`): neither in cook nor at the pass, and idle for 12 hours or more
  (`STALE_DELAY_MS`), or with its changes already on the base, or carrying `zone-released`. When such a PR overlaps the
  zone of a ticket, the gate names it, and the turn keeps it (`zonesPerimees`). On each wake, without the manager, the
  supervisor reads it again with the gate's rule. It adds the label `zone-released` to a stale PR, and never closes it.
  It writes one line on the ticket, `Released the zone held by the stale PR #N (…)`, in the station's service log
  (`supervisor on <project>: …`) and in its gesture log. A PR that already carries the label is not labelled or said
  again. When the PR is a human's (its branch is neither `cook/<n>-…` nor the second's `<type>/<n>-…`), the
  supervisor also opens one `chef-todo` issue asking whether to close it. That issue carries the mark
  `<!-- brigade:zone-released pr=N -->`, and no second one opens while an issue of the last year, open or closed,
  carries that mark. A brigade PR gets no card.
- **The Windows CI card of the base** (#2413, `carte-ci-windows.ts`) is kept, read by the supervisor's wiring from the
  same turn.

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
