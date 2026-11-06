## One station per machine: its presence on GitHub, and its pairing by a code

*Spec: [the station rebuilt from scratch](../superpowers/specs/2026-10-15-station-refonte-design.md) (#794).*

A machine's station (`runtime/src/station/main.ts`, one process for all its projects) has **no direct
link** with the chef's app: it opens no port, and the app never reaches it. Everything goes through
**GitHub**: the station writes its state in a **secret gist** of the account of the machine's `gh`, which
must be the chef's (`runtime/src/appairage/`). Its service log lines are French, as quoted below, until
the runtime is translated.

- **On first start**, it creates its gist, publishes the **fingerprint** of a fresh code (never the
  code) and shows the code in its log: `brigade : station à appairer — tape ce code dans l'app :
  7KQ2-M9XD (valable jusqu'à 14:32)`. Eight Crockford characters, valid a quarter of an hour; once
  expired it draws another, and the old fingerprint stays published as expired (the app says "expired",
  not "unknown").
- **The chef types the code in the app** ("All projects", [docs/app.md](../app.md)): the app finds the
  gist publishing this fingerprint and writes `brigade-appairage.json` in it. The station reads it at
  its next heartbeat and shows no more code.
- **Every minute**, it checks, with no GitHub call, whether its state changed, and rewrites
  `brigade-station.json` (name, machine and cores, version, projects served, last heartbeat) only on a
  change, or as a beat every 5 minutes. Two writes are at least 60 s apart (a request too soon is held,
  then written when due), except at **stop** (SIGTERM): its stop time is written at once. It publishes
  `cadenceMs` = 285 s; the app says it is offline after 2 × `cadenceMs` + 30 s
  (`app/src/stations/stations.ts`), so a brutal stop is detected within 5 to 10 min.
- **Its cores** (`coeurs`, `os.availableParallelism()`) give the app the number of cooks it proposes
  when the chef entrusts a project to this station (#1107): the default cap rule `max(1, ⌊(cores − 2) /
  2⌋)` ([“Several cooks at once”](station.md#several-cooks-at-once)). An older station publishes none:
  the app proposes 2, and says so.
- **Its failures go there too** (`appairage/etats.ts`): `miseAJour` (its last update when it failed and
  rolled back: target and restored versions, time, whether the rollback failed too; read from
  `BRIGADE_MISE_A_JOUR_DIR`) and `connexionMax` (the state of its Max connection and since when). No
  reason, no action: the app makes each a line and a button ([docs/app.md](../app.md)). A read that
  throws does not cost the heartbeat: both fields are then null.
- **What it keeps between runs** (gist, code, pairing) is in `<BRIGADE_STATION_DIR>/appairage.json`. A
  **deleted gist** resets it: fresh gist, fresh code, pairing to redo. **GitHub silent**: the outage is
  said once, its end too, and it retries every minute.
- **Its name** comes from the host name on first start (first label, lowercase, without macOS's
  trailing conflict number), is kept in `<BRIGADE_STATION_DIR>/nom-de-la-station.json` and
  never recomputed. Only an explicit rename changes it: `BRIGADE_STATION_DIR=<dir> node
  runtime/src/station/renommer.ts <name>`, then restart. It keeps its gists, so it replaces the old
  station on the home.

Optional settings (names French until translated): `BRIGADE_GH_BIN` (the machine's `gh`),
`BRIGADE_STATION_NOM` (its name on the home), `BRIGADE_STATION_VERSION` (the version announced; set by
its package, by default the fingerprint of its code). For a test station only, in whole seconds:
`BRIGADE_STATION_ECART_S` (minimum gap between two gist writes, 60) and `BRIGADE_STATION_TICK_S` (the tick
of each project's runtime, 60). Anything else refuses to start the station.

## The chef's stations, read from a fresh computer

*Code: `runtime/src/appairage/stations-du-chef.ts` (#1428).*

On a computer with only the app installed, the stations the chef has paired and their projects are read
from GitHub alone, by that computer's `gh`. The app imports `lireLesStationsDuChef`, or runs `node
runtime/src/appairage/stations-du-chef.ts` (`BRIGADE_GH_BIN` names the `gh`), which prints one JSON line
(exit code 0 when stations are listed, 1 otherwise) in one of three states:

- `listed`: `stations`, each with gist `id`, `name`, `machine`, `kind`, `cooks` (false for a phone),
  `version`, `online` (the app's rule: stopped, or two heartbeats missed), `lastSeen`, `stoppedAt`, and
  `projects`: `{ name, repository }` (the repository the station publishes, `depots` in
  `brigade-station.json`, else the one of the app's request, else null). `unreadable` lists the paired
  gists whose state cannot be read. With no station, `reason` says why.
- `sign-in-required`: this `gh` is signed in to no account, or GitHub refuses its token: `reason`, and
  `action` `{ id: "github-sign-in", label, command }`, `command` being `gh auth login --hostname
  github.com --web --git-protocol https`.
- `unavailable`: `cause` (`gh-missing`, `network`, `timeout`, `rate-limit`, `github`), `reason`, `link`
  when a page lifts it (`https://cli.github.com` for a missing `gh`), `detail` (what `gh` said).

## The projects chosen in the app

*Code: `runtime/src/projets-station/` (#1707); its README holds the detail.*

The app, signed in to the GitHub account of the station's machine, ticks the projects this station
serves: it writes `brigade-selection.json` in the station's registration gist
(`runtime/src/enregistrement-station/`). The station rereads it **every 30 s** (and on `SIGHUP`) and
serves exactly those repositories through the flow of "Adding a project to a station from the app": a
ticked one is cloned, prepared and served; an unticked one leaves its configuration within 30 s, state
and clone kept. The station derives the name, the cap of cooks (from the cores) and a starting
calibration (`sonnet` / `medium`, overridden by the repository's own settings). Its tracking goes into
the same gist. With no selection, or an empty one, it serves no project from the app and its log says so,
again every hour. A station paired by code keeps serving its pairing's request until the app writes a
selection.

## The calls to GitHub, on the account's real quota, and waiting out the limit

*Code: `runtime/src/limite-github.ts` (#873, #874, #1416).*

Every call by the station and its projects to GitHub (issue polling in `github.ts`, the gist channel in
`appairage/canal.ts`) goes through the counter before `gh` leaves.

- **The reference is GitHub's real quota**, never a count of the box's own: the account is shared with
  the chef's Mac. Every `gh api -i` response says what is left (`x-ratelimit-remaining` of
  `x-ratelimit-limit`, until `x-ratelimit-reset`, REST resource `core`) and the counter keeps it. A
  decision on a low quota read more than a minute ago is first confirmed with `gh api rate_limit`, which
  GitHub does not count, at most once a minute.
- **The kitchen is held only at the gestures' reserve.** Polls, pass, manager, heartbeat: above the
  **reserve of the chef's gestures** (a tenth of the quota, 500 of 5,000) nothing holds them. At the
  reserve the kitchen waits for the end of the window, then resumes by itself. A held call does not leave
  and is not counted; the caller treats it as a wait, said once in the log (`quota GitHub bas : N appels
  restants sur 5000, gardés pour les gestes du chef — la cuisine attend la fin de la fenêtre, dans N
  s`). `status` says it on its `github` line (`the box holds its own calls to keep the reserve for your
  gestures, back around HH:MM`); "GitHub is rate-limiting calls" is kept for when GitHub itself refused.
- **The chef's gestures are never held by the box.** `rail` (remove, merge, send-back, choose, answer),
  `pass <ticket> issue|comment` and `manager` fail only if GitHub refuses. They are counted, and
  spend the reserve.
- **Shared, not split.** The counter is a SQLite database,
  `<BRIGADE_STATION_DIR>/appels-github/compteur.db`, held together by the station and its projects: they
  read the same quota and keep the same pace, a transaction deciding between two processes taking the
  last call. The quota is kept per account: the machine's `gh`, and each role identity (its App has its
  own). A process outside any station (dev workstation, test) counts alone, in memory. The pace is not
  divided among projects; what grows with projects is the consumption.
- **Tuning**: no environment variable; the reserve (`RESERVE_DES_GESTES`) is a constant of
  `runtime/src/limite-github.ts`.
- **The hourly line**: the log writes `brigade : N appels GitHub sur l'heure écoulée` (all processes),
  plus `— GitHub en dit R restants sur 5000` when GitHub has said its quota.
- **GitHub's limit reached** (its 429, or its 403 "rate limit"; a 403 on a forbidden merge stays a
  refusal): the station stops every call and sets a pause on the counter, shared by all its processes,
  until the end of the window, read in `retry-after`, else `x-ratelimit-reset`, else `gh api
  rate_limit`, else 60 s — doubled at each limit that comes back within 15 min of the previous pause's
  end, up to 15 min (`RECUL_MAX_MS`, #2436): resuming every project after one minute set the secondary
  limit off again, and each new try lengthens it. Refusals of one burst, arriving during the pause they
  set, do not double it. During the pause no kitchen call leaves and nothing is counted (a chef's
  gesture still tries, and fails on GitHub's refusal). The log says it twice, whatever the number of
  projects (#2436): `brigade : GitHub limit reached — no call leaves the station before HH:MM` when it
  starts, `brigade : GitHub calls resumed` when the next call leaves; the manager, the GitHub-only turn
  and the stale-branch cleanup say nothing of it. The resumption is automatic. During the wait the
  station does not write its state on GitHub — except as the pause starts (#2443): its
  registration (`runtime/src/enregistrement-station/`) is written outside the pause with `heldBy`
  (the limit, since, until), tried again each minute, three times at most, if GitHub refuses it too
  (`ESSAIS_DE_LA_RETENUE`), so the app shows it `held by GitHub's limit until HH:MM`, never offline,
  and keeps its projects attached to it; listeners hear the pause through `surLaPauseDeGitHub`. The
  presence gist (`appairage/`) still goes quiet, and the app says it offline after 2 × `cadenceMs` + 30 s.
- **No burst at start (#2436).** The station opens its projects together, but their first GitHub-only
  turns are spread evenly over a window (`BRIGADE_STATION_FENETRE_S`, 300 s by default, 0 = all at once, #2587):
  project *i* of *n* starts at *i*/*n* of it (`runtime/src/lecture-initiale/etalement.ts`); after that first turn the usual
  rhythm applies. The stale
  `cook/<n>-github` branches are cleaned a few at a time: each pass reads the issues of at most
  `BRANCHES_PAR_TOUR` (3) branches, and the next pass goes on from there
  (`runtime/src/github-seul/elagage/elagage.ts`) — before, every tick read the issue of
  every branch, for every project.
- **Writes are paced (#2145).** GitHub's secondary limits cap writes (about 80 a minute and 500 an
  hour per account). Every kitchen write (`gh api` with a method other than GET, or with fields) goes
  through the same counter, per account and for all the station's projects together: at most
  `ECRITURES_PAR_MINUTE` (60) in any sliding minute and `ECRITURES_PAR_HEURE` (450) in any sliding hour
  (`runtime/src/limite-github.ts`). A write over budget does not fail and is not counted: it waits for
  the oldest write of the full window to leave it, then goes. Reads and the chef's gestures are never paced.
  While writes wait, the pacer says it (#2226): `status` carries a `github` line, `held by the GitHub write
  budget — N of 450 in the last hour, next write at HH:MM` (N counts the account's writes of the hour;
  the time is the earliest the next write can go), the app's project view shows the same line, and the
  station's service log says it once when the hold starts (`brigade : écritures GitHub retenues par le
  budget — …`) and once when the last waiting write goes (`brigade : écritures GitHub reprises …`).
- **Requests are paced too, in points per minute (#2443).** GitHub's secondary limit also caps an
  account's REST points per minute (900: a read costs 1, a write 5), and a 304 counts there even though
  it costs nothing on the hourly quota. The box paced only writes and concurrency, so the four projects'
  GitHub-only turns, the pass and the closing passes firing together — after a pause above all —
  passed 900 points within a minute while the hourly quota showed nothing unusual (1,936 of 5,000 at
  14:31 on 2026-11-05): that is what set the secondary limit off several times a day. The box's
  service log of that day shows the two bursts: of its nine windows, six opened within 14 minutes of a
  station restart (an update), when every project reads everything again with no ETag kept, and seven
  were set off again within a second of `GitHub calls resumed`, when the calls queued during the pause
  all left at once. Every kitchen
  request now goes through the same counter's budget of `POINTS_PAR_MINUTE` (450) in any sliding
  minute, per account and for all the station's projects (`POINTS_PAR_LECTURE` 1, `POINTS_PAR_ECRITURE`
  5). The points are kept in memory, per process, like the queue they pace: the station and its projects
  share one, a command outside it keeps its own; a 304 does not leave them. The other half is the chef's:
  the app on their Mac and their gestures, which are never paced and take nothing from the budget. A request over
  budget waits in the queue (`AppelEspace`), and every later request of its account, reads included,
  stays behind it; the log says it once (`brigade : appels GitHub espacés par le débit — …`).
- **One queue, four in flight (#2195).** All the station's projects share, in its process, one queue of
  kitchen calls in arrival order: at most `REQUETES_EN_VOL` (4) GitHub requests are in flight at once, and
  a freed place goes to the first arrival that can take it. A write the pace holds never lets a later
  write of the same account pass it, whatever its project; a read is not held behind it. Waiting writes
  have no timer of their own: the queue holds a single wake-up, at the instant the pace frees its next
  place. A chef's gesture never waits for a place, but holds one while in flight. A process outside the
  station (a command) keeps its own queue, under the same shared counter.
- **Where the calls go (#1417).** Every `gh api` call is recorded on the counter with its project
  (`BRIGADE_PROJECT`, else the repo; `station` for the gist channel) and a kind (`issue-comments`,
  `pull-requests`, `issues`, `gist`, `gesture`, `board` — the Kitchen board's refresh, which no runtime does since #2061 —, `other`) over the
  sliding hour. `status` prints, read-only (absent without a counter), `gh calls   N calls in the last
  hour`, `most calls: project <p> (n), kind <k> (m)` and `board cost   N calls per hour, all projects`.
  `faits` carries `appelsGithub`: `total`, `topProject`, `topKind` (`{name, calls}` or null),
  `byProject`, `byKind` (biggest first, ties by name).
- **Calls by identity (#2316).** Every call that leaves is also counted under the identity whose token
  its client carries: the `cook`, `pass` or `manager` App, or the chef's account (the machine's `gh`,
  any call with no role token). The count is cumulative — neither the hour nor a read resets it — and
  holds only numbers and role names, never a token, key or login (`runtime/src/appels-par-identite.ts`,
  `<BRIGADE_STATION_DIR>/appels-github/identites.db`; outside a station
  `<BRIGADE_STATE_DIR>/appels-par-identite.db`). The kitchen notes its mode where it says it at start
  (`station/cuisine.ts`, `main.ts`), and `status` prints it: `identity   GitHub — one identity per role`
  when the three Apps are active, else ``GitHub — single identity, the machine's `gh`: …``, then
  `calls by identity: cook N, pass N, manager N, chef's account N` (zeros without a counter).
- **Repeated reads cost nothing while nothing changes (#1419).** Every read the kitchen repeats (an
  issue, its comments, its events, a PR list and detail, its CI, a diff, the station's gist) is asked
  again with the ETag of its last answer (`If-None-Match`). While nothing changed GitHub answers 304,
  which it does not count: the box takes the call out of its counter and uses the answer it kept. A
  polled list of several pages (the open issues past 100) is asked again page by page, each under its
  own ETag, and is "unchanged" when every page is (#2198); `issuesDepuis` (`since=`) is conditional
  too, so the open breaker's tick, which asks the same instant again, costs nothing. Only the last page
  of a full list stays unconditional. Two identical simultaneous reads make one call. Kept answers live
  in memory, bounded to 32 MB.
- **What the chef sees.** During the pause, `status` writes a head line `github     GitHub is
  rate-limiting calls, back around HH:MM`, and `faits` carries `limiteGithub` (resumption instant, ISO;
  absent outside a limit). Both read the pause on the counter, read-only, through `BRIGADE_STATION_DIR`
  (ssh does not depend on GitHub); the text of `gh` never appears. The app shows a line in each
  project's alert band, in the chef's local time.
- **Which limit (#2144).** A refusal seen by `github.ts` also names the limit, per account, in
  `<BRIGADE_STATION_DIR>/appels-github/limites.db`: `primary` (hourly quota at zero, "API rate limit
  exceeded"), `secondary-writes` ("content creation", or a secondary limit hit by a write) or
  `secondary-concurrency` ("concurrent", or a secondary limit hit by a read). `since` is the response's
  `date` header, `backAt` its `retry-after` (seconds or HTTP date), else `x-ratelimit-reset`, else the
  box's pause. Every project of the station reads it: `faits` carries `github: {limit, since, backAt}`
  (ISO), absent when calls pass, and the `status` line becomes `GitHub is rate-limiting calls:
  secondary limit (writes per minute), since HH:MM, back around HH:MM`. The entry stays until `backAt`
  has passed and a call of that account succeeds (HTTP below 400).

## Adding a project to a station from the app, without a terminal

*Spec: [the station rebuilt from scratch](../superpowers/specs/2026-10-15-station-refonte-design.md) (#795).*

A project is only a line of the station's configuration. The chef adds it from the app
([docs/app.md](../app.md), "Add a project to your stations, without a terminal"); the app writes its
request in the gist of each station he chose, and the station reads it there (`runtime/src/projets/`).

- **What the app writes**: `brigade-projets.json`, per project: its name (from the repository), its
  repository, its integration base, whether this station is its **main** one (running its manager and
  pass), its cap of cooks, and the manager and reviewer calibration.
- **Every thirty seconds** (or on `SIGHUP`), a paired station rereads the request. For each project of
  which it is the main station:
  1. **its GitHub Apps** (`BRIGADE_GITHUB_APPS_DIR`, if set) must be installed on the repository;
     otherwise it publishes, for each App, the install page
     (`https://github.com/apps/<app>/installations/new`) and waits. Without Apps it acts under its `gh`
     account;
  2. it **clones** the repository through `gh repo clone` into `<BRIGADE_STATION_DIR>/clones/<projet>`
     on a server, `~/.local/share/brigade/station/clones/<projet>` on the chef's computer (whose station
     lives under `~/.config/brigade`, which no cook reads: "A local kitchen: all its cooks in the
     sandbox" in [`station-distante.md`](station-distante.md)). It always clones **over HTTPS with its own
     token** (`https://github.com/<repository>.git`), so the account's `git_protocol ssh` does not apply
     (#1390). **Failed**, the tracking says why ("The failed clone") and it retries at every beat;
  3. it **checks it can fetch and push**, through the machine's git, on the `origin` of its clone:
     `git ls-remote` of the integration base, then `git push --dry-run`
     (`runtime/src/projets/acces.ts`, #1117), since `gh repo clone` lends its credentials to the clone,
     not to later fetches. **Refused**, the project is not prepared (no decisions, preparation ticket or
     line) and the tracking carries the blocked access ("The blocked access"). **Unreachable** (network,
     no answer within sixty seconds) is not a refusal: the tracking says `en-preparation`. It rechecks
     at every beat and serves the project as soon as access passes, without a restart;
  4. it **writes to the project's log** the decisions of the flow under the chef's name
     (`BRIGADE_STATIONS`, `<station>/claude:<cooks>:code+raisonnement`; the manager and reviewer
     calibration), only those not already there: a decision changed since is not overwritten;
  5. it **opens the project's first ticket** on GitHub ("The first ticket: preparing the repository");
  6. it writes its **line** (`<projet> <dépôt> <branche>`) in its configuration, in a block it holds
     alone between two comments (hand-written lines outside the block are never touched; a project that
     already has one keeps it, and the tracking says so), rereads its configuration at once and
     publishes its presence: the project is in its list on the home.
- **What it says about it**: `brigade-projets-suivi.json`, rewritten on change; per project `servi` (and
  since when), `a-autoriser` (with its pages), `en-preparation`, `refuse` (failed clone, refused
  repository access, hand-written line, station refusal) or `secondaire`. A `servi` project whose kitchen
  no longer prepares a worktree also carries `worktree`; one with blockers, `blocages`; next to the
  list, the **onboarding** of each project of which it is the main station. Keys and status words are
  French until translated.
- **Removed from the app**, the project leaves the request: the station removes its line from the block
  and no longer serves it; state and clone stay.
- **A station that is not the main one** of a project writes no line for it and says it `secondaire`.
  The project's kitchen lets a second station cook alongside the first once it is declared
  `distante+ensemble` and works through GitHub alone ("A second station of the project, which cooks
  alongside the first" in [`station-distante.md`](station-distante.md)): the main station declares it
  that way when it reads its paired gist, and takes its cooks from there. The secondary station joins
  the kitchen of the station serving the project, as a ticked project would (#1830): it publishes it in
  `brigade-cuisines-rejointes.json` and claims its tickets, or refuses in one sentence when that station
  is not reached. While none serves it, it waits.

### The blocked access

*Ticket #1117.* When the check of step 3 is refused, the project's line says `refuse` and carries
`acces`, absent as long as nothing is refused: `bloque` (`fetch`: cannot fetch; `push`: fetches, cannot
push), `raison` (one English sentence ending with git's line), `geste` (what the chef does to lift it,
one sentence); `dit` carries both. The keys are French until translated.

| git says | action |
|---|---|
| no credentials, https remote, no credential helper | `gh auth setup-git` |
| no credentials although a credential helper is set | `gh auth login`, then `gh auth setup-git` |
| `403`, `Permission to … denied`, read-only key | give the station's account read (`fetch`) or write (`push`) access, at `https://github.com/<repository>/settings/access` |
| `Repository not found`, repository absent | `gh repo view <repository>` under the station's account, and give it access |
| `Permission denied (publickey)` | add the account's ssh key (`gh ssh-key add <key>.pub`) |
| `Host key verification failed` | `ssh -T <host>` once, accept its host key |
| anything else | the git command to rerun on the station |

The log says it once (`brigade : station — <projet> n'est pas servi, son dépôt refuse le fetch : …
Geste : …`), and the **onboarding** shows it at the `depot` step, current, with the action "On
<station>, under the account that runs it.".

### The failed clone

*Ticket #1390* (`runtime/src/projets/echec-du-clone.ts`). When the clone of step 2 fails, the project's
line says `refuse` (`refus.code`: `clone-failed`) and carries `clone`, absent as long as the clone does
not fail: `cause` (table below); `raison` and `geste` (one English sentence each, no git output; `dit`
carries both); `ou` (where the action is done) and `liens` (the GitHub pages); `compte` (the account of
the station's `gh`, `gh api user`, null if unreadable); `detail` (what gh and git said, shown behind a
"details" link); `reessaieToutesLes` (seconds between two attempts, the beat: a gap, not an instant, so
the tracking is rewritten only on change).

GitHub answers "Repository not found" both for a missing repository and for one the account cannot see.
After a failed clone the station therefore asks its `gh` for its account, the type of its token (read on
its prefix, never kept: `github_pat_` is fine-grained, covering only the repositories chosen for it) and
whether the repository's owner exists (`gh api users/<owner>`).

| what gh and git say | `cause` | action |
|---|---|---|
| host unresolved, connection refused or timed out, `5xx` | `unreachable` | nothing if GitHub is down; else check the station's network |
| `Host key verification failed`, `Permission denied (publickey)` | `ssh-rewrite` | remove the `url.<…>.insteadOf` setting sending GitHub to ssh |
| SAML SSO | `sso-required` | authorize the token for the organization's single sign-on |
| no credentials, `401` | `not-logged-in` | `gh auth login` on the station |
| `403`, `Permission to … denied` | `no-read-access` | give the account read access, at `https://github.com/<repository>/settings/access` |
| not found, owner does not exist | `repository-missing` | check the repository's name in the app |
| not found, fine-grained token | `token-excludes-repository` | add the repository to the token, at `https://github.com/settings/personal-access-tokens` |
| not found, otherwise | `account-cannot-see` | invite the account as a collaborator, at `https://github.com/<repository>/settings/access` |
| anything else | `unknown` | the details say what git answered |

The log keeps git's `fatal:` line. The **onboarding** shows the failure at the `depot` step, current:
the reason, when the station tries again, and the action with its page. Once the action is done, the next
attempt clones, the field disappears, and the step goes green by itself.

### The worktree that does not prepare

*Ticket #1118.* The access checked before serving can fail afterwards (credential helper removed, right
revoked), and a worktree can fail to prepare for another reason (disk, conflict). The ticket is then 86
(`worktree-failed`) and proposed again ten minutes later; the project's line, still `servi`, carries
`worktree`, the last failure read in its kitchen's log (`runtime/src/echec-du-worktree.ts`), absent as
long as none fails: `ticket`; `raison` (git's error as it said it, or the reason for the refusal when
the attempt stumbled on the access rechecked before fetching); `prochainEssai` (ISO); `acces` (when the
station cannot fetch or push, same shape as the blocked access). A new failure replaces it; a success
removes it. Each attempt rechecks access first: once the action is done, the station resumes at its
next attempt, without restarting the app.

**The refusal, told to the chef** (#1177): whatever the cause, a `refuse` project also carries `refus`:
`{ status: "refused", code, message, action }`. `code` is stable (`sandbox-unusable`, `door-not-open`,
`clone-failed`, `fetch-blocked`, `push-blocked`, `already-served`…; authoritative list in
`runtime/src/projets/refus.ts`), `message` a sentence for the chef, `action` what he can do. It
disappears once the project is served. The `en-service` file keeps the raw error text.

**The refusal's remedy** (#1203): each refusal also carries `remedy`, `{ id, description, destructive }`
(the action a button of the app has the station perform; if destructive, the app asks for confirmation),
or `noRemedy`, one sentence saying why there is no button. Remedies are entered in a registry
(`runtime/src/remedes/registre.ts`) with the codes they lift; as long as none lifts a code, its reason
with no button (`SANS_REMEDE`) takes its place.

The app asks for a remedy through the station's gist, for the chef's computer as for a remote station
(`runtime/src/remedes/distant.ts`): it writes `brigade-remedes.json` (`requests`: `id`, `askedAt`,
`project`, `refusal`, `remedy`); the station reads it at its beat, plays each request once through
`runtime/src/remedes/executer.ts`, and answers in `brigade-remedes-suivi.json` (`answers`: `id`,
`answeredAt`, `outcome`, …). The entry point checks that the refusal still holds and offers this
remedy, plays it, rereads the project, and returns `lifted` (the refusal is gone), `holds` (`reason` says
why, `refusal` is the refusal as it is now) or `error` (nothing was played: unknown remedy, a refusal
that does not offer it, a refusal lifted or changed since). A request over ten minutes old is not
played; one already answered is not replayed, even after a restart. The app removes its request once
the answer is read, and the answer leaves the gist at the next beat.

**The remedy catalog** (#1204, `runtime/src/remedes/catalogue/`, one file per action):
- `proxy-port-set` → `remove-port-setting` (destructive): removes `BRIGADE_PROXY_PORT` from the project's line.
- `hand-written-line` → `remove-hand-written-line` (destructive): removes the hand-written line, never the app's block.
- `configuration-invalid` → `rewrite-project-line` (destructive): erases the line the app wrote; the station rewrites it.
- `clone-missing` → `clone-repository-again`: clones again through the machine's `gh`.
- `sandbox-unusable` → `update-claude`: `claude update`; if the sandbox stays unusable the refusal holds.

The other refusals (`already-served`, `door-not-open`, `clone-failed`, `fetch-blocked`, `push-blocked`,
`decisions-not-written`, `handed-over-elsewhere`, `unexpected`) carry `noRemedy`. `clone-missing` and
`sandbox-unusable` are replayed at every reread, their remedy not acting on the configuration.

### The project's blockers

*Ticket #1394, epic #1393.* Whatever stops a project between its adding and its service is one
**blocker**, in a single runtime model (`runtime/src/installation/blocages/`) that every part of the
installation feeds and the project's page shows. A blocker is written to the **project's log**
(`blocker.raised`, `blocker.resolved`, no ticket), so the station and the project's kitchen both write it
from their own process; the station reads them at each beat and publishes them in the project's line
of `brigade-projets-suivi.json`, in any state, under `blocages`, absent when none:

- `id`: the stable key chosen by whoever raises it. Raised twice identical, nothing is written; changed,
  it replaces the old one in place. Resolved, it leaves; raised again, it comes back last.
- `message` (what is blocked) and `cause` (why): one English sentence each.
- `action` (optional): the gesture the app can perform to lift it. `link` (optional, `https` only): the
  page where the chef lifts it outside the app. `detail` (optional, 2000 characters): what a command
  said, shown second.

**Raw output is never the message.** A message or cause that is only a command's output (several lines,
`exit status`, `fatal:`/`error:`, an `ERR_…`/`ENOENT` code, a stack trace, a shell prompt, or over 400
characters) is moved into `detail` when written, and a fixed sentence takes its place. A malformed
blocker (unreadable `id`, `action` or `link`, empty message or cause) is a producer's bug: refused
(`BlocageInvalide`). `poserBlocage` / `leverBlocage` (or `…Dans`, on a state directory) raise and
resolve; `lireBlocages` reads.

### What the station lacks for the project

*Ticket #1398, epic #1393.* At each beat, the main station reads what the project's tests need in its
clone (`runtime/src/installation/besoins/`): the worktree setup (a command it runs such as `psql` or
`docker`, a `postgres://` address), the test configuration (test scripts, a Playwright or Cypress config,
the services its CI starts) and its manifests (dependencies, a Prisma datasource, a Flutter
`pubspec.yaml`, an Xcode project…). The catalogue names a database (Postgres, MySQL, Redis), Docker, a
browser and the SDKs (Go, Rust, Java, .NET, Flutter, Android, Xcode, Swift); a package manager is not in
it, the kitchen installs it alone. The repository is reread only when its clone moves to another commit.

It compares with what the station provides: a command on the machine's `PATH`, Playwright's browsers,
`ANDROID_HOME`, or a capability the project declares for a station of this machine in
`BRIGADE_STATIONS` (`postgres`, `docker`…; declared is enough, no probe). **A service is provided only if
the station can actually use it** (#1532): binaries on the `PATH` only say a probe is worth running,
under the station's account and environment (`PGHOST`, `~/.pgpass`, `~/.my.cnf`…):

- a database (Postgres with `psql`, MySQL with `mysql` or `mariadb`): connect, create a database
  `brigade_essai_<pid>_<random>`, drop it whatever the result; connection refused or creation denied: not
  provided;
- Redis: `redis-cli ping` answers `PONG`;
- Docker: `docker info` (or `podman info`) succeeds.

No password is ever asked, a command that does not answer is stopped after 15 s, and a verdict holds two
minutes (`ESSAI_VALABLE_MS`). For each need it lacks, **one choice**, with four options, each with its
consequence:

- `cook-elsewhere`: which tickets wait, and for which station (a remote station of the project
  declaring the capability), or that none is declared and they do not start;
- `provide-here`: what gets installed on this station;
- `adapt-tests`: what the test coverage loses;
- `setup-brings-it` (#1534), "The project's setup brings it itself": a ticket of the project makes its
  worktree setup provide the need on its own (for a database, a throwaway server under the cook's
  account on a free port, or in a container), so nothing is installed. It carries `"recommended": true`
  when the station already has what the setup would use: the server's binaries (`initdb`, `pg_ctl`,
  `postgres`; `mysqld`, `mariadbd`; `redis-server`) or a Docker that answers the cook's account. Otherwise
  the flag is absent; a browser, Docker and the SDKs never carry it, nor do the other options.

A project's tracking line also carries `delai` (#1401, `runtime/src/installation/delai/`): `ajouteLe`
(first preparation, logged once as `project.added`), `serviLe` (first served ticket other than the
preparation ticket, or null) and `duree` (milliseconds between the two, frozen once set).

The choice is written to the project's log (`need.choice-raised`), with a blocker under the same id
(`need:<need>`, action `choose-need`), and published in the project's line under `choix`, absent when
none: `id`, `need`, `message`, `cause`, `options` (`id`, `label`, `consequence`, `recommended`) and
`status` (`pending`). Every text is a sentence built by the runtime: the cause names a file and what it
does there, never what it contains. **The chef selects an option in the app**, which writes it in the
project's request (`brigade-projets.json`): `"choix": { "need:postgres": "provide-here" }`. At its next
read the station writes it to the log (`need.choice-selected`, by `chef`): the choice becomes
`"status": "chosen"` with `selected` and `selectedAt`, and its blocker is lifted. When the need stops
being missing (the station has it now, or the repository no longer asks), the choice leaves the list
(`need.choice-dropped`) with its blocker; a selection still in the request is applied again if it comes
back. `choisir` / `choisirDans` record a selection (refusing a choice not raised or an option it does not
offer: `ChoixInconnu`); `lireChoix` reads them.

**Choosing `setup-brings-it` opens one ticket on the project** (#1534,
`runtime/src/installation/besoins/ticket.ts`): at the read where the main station writes the selection,
it opens the issue "Make the worktree setup of `<project>` bring `<need>` itself" (the choice's message
and cause, what the setup must do, acceptance criteria; labels `fire`, `model:opus`, `effort:high`). Its
creation is announced in the log first (`need.ticket-opening`), then noted (`need.ticket-opened`):
after a lost answer or a stop in between, the issue is found again by its mark (`<!--
brigade:need-setup <project> <need> <announce seq> -->`, on an issue by a trusted author) instead of
opened twice; GitHub down, the next read retries. One per choice: switching option and back opens none,
and the published choice carries it (`"ticket": 42`) while `setup-brings-it` is selected. A dropped
choice forgets it.

**At the project's installation, before its first ticket** (#1533): the station holds the project's needs
in its log right after the chef's decisions are written, before the preparation ticket and the line. A
need the station does not really provide (its probe fails) is a pending choice before any ticket can be
cooked; a project whose needs are all provided gets none.

**When the worktree setup fails on a need** (#1533): the station reads the setup's output
(`runtime/src/installation/besoins/setup.ts`) for catalogue needs it names: a line saying it cannot use
one (a Postgres refusing the account, `permission denied to create database`, `ECONNREFUSED …:5432`; a
MySQL `ERROR 2002`/`1045`; `Could not connect to Redis`; `Cannot connect to the Docker daemon`), or one
of its commands not found (`psql: command not found`). Those the station does not really provide
(same judgment, declared capability included) are logged (`need.setup-lacks`, `{ station, needs }`, only
on change) and their choice is raised at once, its cause being the setup. **The chef then gets the needs
choice, not the red card** "The worktree setup of this project fails on box/claude" (blocker `setup`),
which is lifted if it was there. The rest of a setup failure does not change (ticket 86, issue comment,
the preparation ticket's cook that leaves anyway). If the output also says something else is missing (a
file, a command no such need runs), the `setup` blocker stays too. A failure naming no need the station
lacks keeps the `setup` blocker, with the error in `detail`, and clears what the previous setup said was
missing. The choice is kept, even if the repository says nothing of the need, while the station does not
provide it; a setup that passes again clears it (`need.setup-lacks` with no need), dropping its choice.

### The first ticket: preparing the repository

*Ticket #796.* Before writing the line of a project added from the app, the station opens on its
repository, through its `gh`, the issue "Préparer le dépôt : gates, setup de worktree, sites autorisés"
(`runtime/src/preparation-depot/`; title French until translated), with `fire`, `model:opus` and
`effort:high`: it enters the rail like any ticket. Its body tells the cook:

- **what to deliver**: `.claude/brigade/gates.sh`, `.claude/brigade/worktree-setup.sh` and
  `.claude/brigade/reseau` (the sites the project may reach), each with its contract and what the
  integration base already carries ("absent : à écrire", "déjà sur `main` : à éprouver");
- **when the current setup fails there**: the ticket leaves anyway (it repairs it), and the body says what
  failed ("The worktree setup comes before the cook" in [`station.md`](station.md));
- **where to prove it**: on the station that cooks it, which will serve the project, not on a dev
  workstation;
- **the criteria**: gates green on the station, setup run in a fresh worktree, site list present, and in
  the report what was run and what came out.

Its number is kept in the project's state (`<état>/preparation-depot.json`): it is opened only once,
even if the project is removed then added again; created without having been noted, it is found again
among the open issues by its marker (`<!-- brigade:preparation-depot -->`) if set by someone with hand
on the repository. GitHub silent: the line is not written, the tracking says `en-preparation`, and the
station retries at the next beat.

**As long as it is not served, the project's kitchen takes only it**, the same restriction as a red
base, which lets only its repair leave, remote stations included. The log says it once (`brigade : le
rail attend #<n> (préparer le dépôt) — aucun autre ticket ne part avant son merge`); once served, `le
rail démarre`. Closed by the chef or gone, it also
frees the rail; with its `fire` label removed, it still holds it. A project written by hand, or added
before this ticket, has none: its rail is the usual one. The acceptance test
(`runtime/test/0-en-premier/recette.test.ts`) bounds the flow's opening to the project's publication at
ten minutes.

### The onboarding: where a new project stands

*Ticket #1110.* Between "project added" and "first ticket served", the station computes where each
project of which it is the main station stands (`runtime/src/onboarding/`) and publishes it in its
tracking, under `onboarding`, by project name (where the app reads it). A project taken over from
another station (`reprise`) has none. It is computed read-only from the station's tracking, clone,
preparation ticket and the project's log.

- **Four steps, in order** (`etapes`): `depot` (the Apps authorized, the clone, read/write access to the
  repository; refused, its action is that of the blocked access), `machine` (the station that cooks it,
  its kitchen open), `preparation` (the "Préparer le dépôt" ticket, merged), `premier-ticket` (a ticket
  of the chef's on the rail). Each carries `titre`, `etat` (`faite`, `courante`, `a-venir`), an English
  sentence (`dit`) and, if current and awaiting the chef, its `geste`: `quoi`, `ou`, and the `liens`
  where to do it. `courante` names the first one not done.
- **The preparation** (`preparation`): the ticket's number, link and `etat`: `en-cours` (on the rail or
  in a cook's hands), `en-echec` (set aside: `raison`, and `prochainEssai`, null if it does not leave by
  itself), `a-relire` (at the pass, with its `pr`; stopped for lack of a grant or escalated to the chef,
  the action is to reread and merge it), `suspendu` (its `fire` label removed), `faite`, or `abandonne`
  (closed without a merge: the rail no longer waits). Null as long as the ticket is not open. When the
  setup failed at the launch of its last cook (which leaves anyway), the step's `dit` adds what failed,
  until a cook leaves on a setup that passes, or the ticket is merged.
- **Without a sandbox** (`sansBacASable`): true if the project's kitchen noted in the log that its cooks
  run without one (`isolation.configured`, `sandbox: null`); null as long as it noted nothing.
- **Decision awaited** (`decisionAttendue`): true while the project's station cooks without a sandbox
  and the chef has not decided. Nothing leaves for the project, not even the preparation ticket: the
  rail is held (`onboarding/attente.ts`), and the `machine` step is current, offering two choices:
  continue without a sandbox on this machine, or choose another station. The decision
  (`decision-sans-bac-a-sable.json`, in the project's state) carries the station's name and holds only
  for it: the hold lifts the next time the rail is taken, and a project moved to a station without a
  sandbox asks again. A configured or unknown sandbox never holds.
- **Ready**: the first three steps done, the first ticket can be placed: `etat` is `pret`, `termine` is
  true. A project already serving tickets before the preparation ticket existed is ready from the start.

The "no station chosen" case is computed too, but a station publishes only the projects it is asked for:
only the app sees it. The onboarding's field names and status words (`etapes`, `etat`, `faite`, `courante`, `a-venir`,
`en-cours`, `en-echec`, `a-relire`, `suspendu`, `abandonne`, `pret`, `termine`…) stay French until
translated.
