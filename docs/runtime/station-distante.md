### A remote station pulls its work

**The chef's workstation connects to the box, never the other way round.** The box cannot launch a
cook on the chef's machine and has no path to it. A station that runs elsewhere than on the runtime's
machine — `mac/claude`, with the chef's connected Chrome — declares itself `distante` (the word stays
French until the runtime is translated), and **it is the one that comes**: it announces itself, claims
a ticket, renews its lease, hands back its delivery. A second station of the project does so **through
GitHub alone** (below). This chapter describes the box side; the program that plays a remote station
is a station running on that computer, not the desktop app.

```bash
brigade <project> station stations box/claude:30:code,mac/claude:1:chrome-connecté:distante
```

**The box's gesture, for a remote station that is not a second station**, is `brigade <name> pull
<station> <request>`, launched from its workstation. It opens no connection: it writes the request to
the project's log (`remote.asked`), the runtime reads it within a second and answers the same way
(`remote.answered`). The answer is **JSON, on one line**:

| Request | What it does | Answer |
|---|---|---|
| `pull <station> announce [--sandbox <json>]` | the station says it is there — and, with `--sandbox`, what it knows of its workstation's sandbox | what it provides, its cap on cooks, the presence delay, the lease duration, the guardrail caps |
| `pull <station> claim [--sandbox <json>]` | takes a ticket, if there is one for it | `mission` — the ticket, the run, the branch to create (`cook/<run>`, from `base`) or to resume (`resumes`, a send-back from the pass), the calibration, the cook's brief and the arguments of `claude`, the caps, the lease deadline — or `mission: null`, and `held`: what holds it back |
| `pull <station> renew <run> --proof <fingerprint> --turns <n> --tokens <n>` | shows that the cook has worked, and what it has consumed | the new lease deadline |
| `pull <station> return <run> --end livre\|echec [--reason <reason>] --turns <n> --tokens <n>` | hands the ticket back; the cook's last message on standard input | what the box kept: `done`, or `failed` and why |

The values `livre` and `echec` of `--end` stay French until the runtime is translated (`runtime/src/tirer-cli.ts`).

| Code | Meaning |
|---|---|
| `0` | the request is served |
| `1` | refused: `refusal` says why, `said` says it in plain words — and **`stop`**, when the cook is to be stopped |
| `2` | the gesture is badly written: nothing is asked of the box |
| `3` | the box did not answer (no runtime running, or none within thirty seconds): nothing can be assumed |

**The rules are those of a box cook, not rules of their own.**

- **It only receives the ticket it can cook**: the first one, in service order, whose card asks only
  for things it provides (see "The capabilities a ticket asks for" in [`station.md`](station.md)). An
  ordinary ticket only comes to it if it is declared `distante+ordinaires` and its workstation has the
  sandbox (see below). Only a station **declared `distante`** pulls: an unknown name
  (`unknown-station`) or a box station (`not-remote`) is refused, and is not presence.
- **The bounds of a taking are the same**: the chef's "stop", the breaker, the red base (only its
  repair ticket leaves, from a box station), its quota, its cap on cooks (`run station -- cooks <N>`
  sets it too), the zones held by cooks in flight; a ticket not calibrated or with an unreadable card
  is refused. The intake (`BRIGADE_MAX_SETUPS`), the machine guard and the arbiter between projects
  do not hold it back: they guard **this** machine.
- **Its cook is launched by the guardrails** (`cook.launched`, with `remote: true` and the same
  `limits`), with no process here: the box can neither signal it nor read its stream. It holds the four
  caps on what it has: **turns and tokens** on the measure reported at each renewal, **duration** on
  its own clock since the launch, **idleness** when that measure stops moving or arriving. The
  reading, "stop", end and breaker's count are those of any cook.
- **The lease is only renewed on a proof of work**: `--proof` is the fingerprint of the cook's
  worktree (the head of its branch and the state of its files, which the station reads itself). With
  no proof, or the **same** fingerprint as before, the renewal is refused (`no-progress`); the lease
  falls at its deadline and the cook is stopped (`guard.tripped`, `reason: lease`; `cook.stalled` had
  signalled it at mid-lease).
- **"Stopping" a remote cook means accepting nothing more from it.** The box has nobody to signal: the
  end is written at once, the ticket goes back to the rail, and the station learns it at its next
  request — refusal `stopped`, with `stop`: `turns`, `tokens`, `duration`, `idle`, `lease`, `stop`
  (the chef, or the ticket left its hands) or `interrupted` (the runtime restarted). What the cook
  would deliver afterwards is not received.
- **It receives nothing more than a box cook**: no project secret, GitHub token or grant; the same
  brief, arguments of `claude` and forbidden tools. What its workstation does otherwise (its `gh`, its
  browser) is its own: the box neither gives nor guarantees it.
- **Its delivery goes through the same pass.** The station pushes `cook/<run>` **to the origin**, then
  hands back (`--end livre`). The box fetches the branch from the origin — never from the
  workstation —, looks in it for the shape of Claude's credentials, opens the PR, writes the report
  (`cook.reported`) and sends the ticket to the pass: same gates, reviewer, `merge` grant and
  send-backs (to the first station that can cook the ticket). With no commit on the origin, what the
  cook delimited in its last message is its deliverable (`no-diff`); nothing delimited, nothing
  delivered (`no-deliverable`).
- **If its workstation is closed or asleep mid-cook, nothing it pushed is lost.** The lease (or
  idleness cap) falls and the ticket goes back to **queued**. Before handing it back to service, the
  box rereads the cook's branch on the origin: commits beyond the base are the **kept work**
  (`cook.reported`, `kept`, and the issue). The next cook **restarts from it**: on the box, in a
  worktree attached to that branch; on a remote station, with the branch in its mission (`resumes`,
  `returns: 0` — not a send-back); `cook.launched` names the cook it resumes (`continues`). Nothing
  on the origin: it starts from the base. A branch that carries the shape of Claude's credentials is
  never resumed; a send-back from the pass comes first. A woken station learns that its cook is
  stopped (`stopped`, `lease`). A remote station only pushes at delivery: a cook lost before
  delivering has left nothing.
- **What is not guaranteed.** The proof of work and the measure of turns and tokens are what the
  station says. A remote cook stopped by a guardrail delivers nothing, even if it had committed. The
  shape of Claude's credentials found in a remote delivery holds it back from the pass, but its branch
  **is already on the origin**: the issue says to delete it.

**Presence: a remote station that has not shown up recently is absent.** Any request shows it. Past
the presence delay (`BRIGADE_PRESENCE_MINUTES`, two minutes by default) without one, the runtime
writes `station.absent`; at the next one, `station.present`. **It is not a failure**: the tickets
**that only it can cook** are **86**, reason `station-absent: mac/claude`, with no return time, cook
or failure counted, holding neither a place nor a zone, and go back to queued on their own as soon as
it shows up (`ticket.released`, reason `station-present`); the others leave on a box station. The
issue learns it **only once**; `status` says it in the `awaiting` block, and `station` on its
`presence` line.

#### Ordinary tickets on the chef's workstation

A remote station runs **with no partition**: a cook there would read what the chef's account reads
(the `ssh` key to the box, production access). By default it takes **only the tickets that ask for
one of its capabilities**. Declared `distante+ordinaires` (the word stays French), it takes the
**ordinary tickets** too (those whose card asks for nothing); its **cap on cooks** is then the one it
declares, since the box does not see the Mac's cores (`run station -- cooks <N>` sets it too):

```bash
brigade <project> station stations box/claude:30:code,mac/claude:2:chrome-connecté:distante+ordinaires
```

**An ordinary ticket only leaves there inside Claude Code's sandbox** (`runtime/src/bac-a-sable/`).
At each `announce` and `claim`, `--sandbox <json>` carries the object returned by the probe the
station plays on its workstation, `node runtime/src/bac-a-sable/sonder.ts <worktrees> [<cache>…]`
(`<worktrees>` is where it puts the project's cook worktrees): available, the version of its
`claude`, the account's directory and the project's caches; unavailable (not macOS, no Seatbelt
`/usr/bin/sandbox-exec`, a `claude` too old or silent), the reason.

- **Setting and sandbox**: the box lends it an ordinary ticket and writes the configuration for that
  cook — it only writes in `<worktrees>/<run>` and the project's caches, reads neither `~/.ssh` nor
  the chef's credentials, and only reaches the hosts of the project's network list. The mission
  carries `sandbox: true` (so does `cook.launched`), and the arguments of `claude` are a box cook's
  with `--permission-mode bypassPermissions` replaced by `--permission-mode dontAsk --settings <the
  configuration>`. The configuration also sets `npm_config_manage_package_manager_versions=false`
  (its `env`), so that pnpm 10 runs the installed version with no download or signature check
  (#1320): a project's pinned pnpm version is not honoured in a sandboxed cook
  (`runtime/test/bac-a-sable/configuration.test.ts`). The "worktree prêt" setup on a real Mac sandbox
  has not been played.
- **Its ticket is handed to it in a file.** In the sandbox, `gh` has no credentials (`~/.config/gh`
  and the keychain are refused), so the cook could not read its issue (#2095). The mission names
  `ticketFile`, `<worktrees>/<run>.ticket.md`, beside the worktree: the cook's brief points to it
  instead of `gh issue view`, and the configuration lets it read that file. Before launching the cook,
  the station reads the issue and its comments with its **own** `gh`, outside the sandbox, and writes
  them there — what a box cook in a local sandbox receives (`ticketRemis`); the file is removed with
  the worktree. A ticket it cannot read, or a `ticketFile` anywhere else, launches no cook: the
  mission is handed back as `failed`, reason `ticket: …`.
- **Setting without a sandbox** — or a station that says nothing, or a workstation whose configuration
  does not hold: **it takes no ordinary ticket**. The box writes it (`station.sandbox`, with the
  reason), says it in the runtime's output when it changes, and `station` shows it on its `ordinary
  tickets` line (`NONE TAKEN — sandbox unavailable since …: <reason>`).
- **In every case**, the tickets that ask for its capabilities stay taken, bare.

**An ordinary ticket only leaves for the Mac when the box is saturated** (#853): all the box's
stations are at their cap, stopped, or its machine can take no more (`station.saturated`) — read when
the Mac claims. While the box has room it keeps them, even when ramping up (`ramp`) or preparing
worktrees; held back for another reason (stop, breaker, red base, connection, quota, blocked setup),
it is not saturated. With no station on the box, the Mac takes them as soon as it has the setting and
the sandbox. The `ordinary tickets` line of `station` says it, and `facts`, field `stations` (see
"Facts, for a program" in [`etat-et-mesures.md`](etat-et-mesures.md)), carries the state.

#### A second station of the project, which cooks alongside the first

*Ticket #1287.* `distante+ordinaires` is a **backup**. A station added as **one more station** of the
project cooks **at the same time** as the first; the chef declares it `distante+ensemble` (the word
stays French):

```bash
brigade <project> station stations box/claude:3:code+raisonnement,mac/claude:2:code+raisonnement:distante+ensemble
```

- **It takes the project's tickets as soon as it has room**, up to its own cap: at its `claim` it
  receives the first ticket, in service order, that it can cook — ordinary ones included, **whether
  the box is saturated or not** (a box that ramps up or is held by its own connection or quota does
  not hold it back). **A ticket is never taken twice**: the runtime that serves the project writes
  every taking to its log, one request at a time, so two simultaneous claims receive two different
  tickets — or nothing.
- **Stopping or losing one does not stop the other** (`station -- stop <station>`, the box's Max
  connection or quota, a silent second station whose ticket goes back to the rail). The runtime is not
  shared: if the first station's machine stops, the kitchen stops with it.
- **One kitchen per project, run by the main station.** The rail, the manager and the pass run only on
  the first station; the second only cooks, and its deliveries go through the first station's pass and
  reviewer.
- **How a second station cooks, through GitHub only.** The station alone writes its requests in its
  own paired gist, one file per slot (`brigade-pull.<owner>.<repo>.<slot>.json`,
  `runtime/src/tirer-par-github/demande.ts`). The main station reads them every thirty seconds, relays
  each fresh one to the project's log once, and publishes its answer on the Kitchen board (`distantes`,
  [`tableau-de-cuisine.md`](tableau-de-cuisine.md)): `claim`, `renew.<run>` (with the proof of its
  worktree), `deliver.<run>` (once the branch is pushed to the origin; the main station fetches it,
  opens the PR, and the pass judges it as any cook's). A silent station stops renewing: at the
  deadline its cook is stopped, the ticket goes back to the rail, and the station learns it from its
  next answer (`stopped`, `lease`). The box only sees the cook in what its renewals report, so the
  station renews every third of the lease and **at most every quarter of the idleness cap**
  (`intervalleDeRenouvellement`): at a third of a 30-minute lease alone, the first renewal left at 10
  minutes — the cap itself —, and the box stopped every cook longer than that at 0 turns and 0 tokens
  (#2095).
  Each `claim` carries `since`, the instant the station started at its clock: a station whose cook
  ended with 0 turns and 0 tokens takes no more tickets (`held: unstartable`) until a claim says it
  started after that failure — restarting it is the gesture (see "A cook that cannot start" in
  [`station-cook.md`](station-cook.md)).
- **The same sandbox guard as `ordinaires`**: with no sandbox said, or an unavailable one, it takes
  only the tickets that ask for one of its capabilities.
- **On the GitHub-only state** (`githubOnlyState`, [`reglages.md`](../reglages.md); #2219), the
  project's log no longer holds the rail, so the main station does not relay the requests to it: it
  answers them itself from GitHub (`runtime/src/tirer-par-github/sur-github-seul.ts`), on the same
  Kitchen board. A `claim` gets the first free ticket in the turn's order (`prio:`, then the oldest),
  calibrated, whose zone no open PR holds, taken by a claim comment **in the second station's name**
  (`github-etat/prise.ts`): when the main station's own turn and the second station want the same
  ticket, the earliest claim comment wins and the other takes the next one — a ticket is never taken
  twice. Its mission is a turn cook's (`cook/<n>-github`, resumed from the origin when an open PR
  carries it), always in the workstation's sandbox: a station without one gets nothing. `renew` is
  accepted while the station holds the ticket on its issue (the chef removing `taken` or `fire` stops
  its cook); `deliver` opens the PR and puts the ticket `in-pass`, where any station reviews and
  merges it — or, with no delivery, gives the ticket back on its issue and says why. The switch is
  read on the integration branch of the main station's clone the first time a second station asks,
  as the kitchen reads it when it opens. A silent second station keeps its claims: their lease is not
  part of this.

`station` (its `ordinary tickets` line: `taken alongside the box's stations, as one more station of the
project …`) and `facts` (the `ensemble` field of `stations`) say it.

**A station paired through the app is declared with no command.** A station the app pairs through its
gist and adds to a project as not its main one (`secondaire`, in [`station-machine.md`](station-machine.md))
is declared in the log by the main station as `distante+ensemble`, written by the runtime; the main
station reads the paired gists at most every five minutes (`CADENCE_DES_APPAIREES_MS`,
`runtime/src/projets/secondaires.ts`). Its name is `<machine>/claude` (`machineDe`); its cap on cooks
and capabilities are those set in the app, and changing them there changes the declaration at the next
reading. It provides what the pairing says of its computer and what the chef ticked, plus `code` and
`raisonnement`, `macos` on a Mac, and what the installation **detects** there without launching
anything (Chrome, the Android SDK, a Postgres server, …; `capacitesDeLaMachine`,
`runtime/src/projets/ajout-de-station.ts`). It works through GitHub like any second station.

- **Adding it is the only gesture** (#1830). Whether the chef ticks the project on the station's own
  page or adds the computer from the project's Cooks page ("+ station"), the station joins the
  kitchen that runs (`runtime/src/projets/rejoindre.ts`), publishes it in
  `brigade-cuisines-rejointes.json` of its paired gist, and opens its claim loop
  (`runtime/src/tirer-par-github/cuisiner.ts`). A station with a selection still reads the projects
  added from a project's page in its pairing gist's request (`runtime/src/projets-station/source.ts`).
  While no station serves the project, it opens no kitchen and joins at the next reading.
- **One path for every project the main station serves** (#1923), whether the app asked for it or a
  hand-written configuration line serves it. A joined station the project cannot declare is a blocker
  of the project's journal (`joined-station:<station>`), lifted once it is declared.

**What it says when it cannot cook yet.** A station installed from the app and cooking nothing says
why on its line of the home screen, with the gesture: `not reached` (stopped or silent on GitHub:
start Brigade on its computer, button **check again**), `cannot be read` (its page on GitHub: remove
it, pair it again with a new code, button **open its page**), `not added to any project` (button
**add a project**). For a second station the main station cannot reach, the project's list shows `not
reached`, the runtime's status (`station`, `dit`) the reason, and the hover text the gesture
(`GESTES_DE_LA_RAISON`, `runtime/src/projets/secondaires.ts`): `arretee` (start Brigade there again),
`muette` (no sign of life on GitHub: open Brigade there), `gist-illisible` (check the GitHub
connection in the app).

#### A local kitchen: all its cooks in the sandbox

**A project whose kitchen runs on the chef's Mac** — in the station its app launches
(`runtime/src/station/cuisine.ts`) — **launches every `claude` of its kitchen in Claude Code's
sandbox, without exception**: a ticket's **cook**, the closing pass's **closer**, the **pass's
reviewer**, the **manager's judgement** (`runtime/src/bac-a-sable/local.ts`). A kitchen is local when
its station runs under macOS: the box is never one, and its partition (`bwrap`) guards it.

- **The same configuration as for a lent ticket** (`runtime/src/bac-a-sable/configuration.ts`),
  written for the directory where the launch works. The network list is `.claude/brigade/reseau` of the
  integration branch, reread at each launch; unreadable, the base alone (Anthropic and GitHub). A
  cook's `--permission-mode bypassPermissions` gives way to `--permission-mode dontAsk --settings
  <the configuration>`; the reviewer and the judgement receive them in front of `--setting-sources`.
- **The project's caches** are named in `BRIGADE_SANDBOX_CACHES` (absolute paths separated by `:`);
  none by default.
- **Where its cooks work: the station's workshop** (*ticket #1176*). The app puts the station under
  `~/.config/brigade/station`, which no cook reads, so the **clone and worktrees** live in the
  workshop, `~/.local/share/brigade/station/clones/<project>` and `…/worktrees/<project>/<run>`
  (`atelierDeLaStation`). A station outside everything a cook must not read, or on a server, keeps
  everything under its directory. The station gives the paths (`BRIGADE_REPO_DIR`,
  `BRIGADE_WORKTREES_DIR`); a line does not set `BRIGADE_WORKTREES_DIR`.
- **A project served before moves into the workshop on its own** (`runtime/src/station/atelier.ts`):
  clone and worktrees are renamed as they are, then `git worktree repair`; nothing is copied or
  removed. What cannot be moved stays where it is, and the kitchen opens all the same. The service log
  says both (`déménagé dans l'atelier de la station — …`, `pas déménagé dans l'atelier de la station
  — …`; still French).
- **Without a sandbox, the kitchen does not open**: the station refuses the project, naming what is
  missing (`sur ce Mac, chaque cook part dans le bac à sable, et il n'est pas utilisable — <reason>`;
  still French). Fixed, it reopens at the station's restart or when its line changes.
- **What it does not keep**: what the runtime itself launches outside `claude` — the worktree's setup,
  the gates.

**Is the sandbox usable on this Mac?**

```bash
BRIGADE_STATION_DIR=<the station's directory> node runtime/src/bac-a-sable/verifier.ts
```

It writes `ok` (code 0), or what is missing in one sentence (code 1): not macOS, no Seatbelt, a
`claude` too old or silent (the one the station launches: `BRIGADE_CLAUDE_BIN`, otherwise `claude`),
`HOME` missing, a relative cache, or worktrees where a cook must read nothing; 2, badly called. It
tries the station's places with a trial cook in its workshop, so a station under `~/.config/brigade`
— the app's default — **holds**. The sentences stay French until the runtime is translated
(`runtime/src/bac-a-sable/local.ts`, `detection.ts`, `configuration.ts`).

**Checking by hand**, on the Mac: `--settings` returns the configuration for a directory and a list of
hosts; `claude` launched with it must refuse what a cook does not do. The trial directory is under the
account (`/tmp` links to `/private/tmp` under macOS).

```bash
mkdir -p "$HOME/brigade-essai-wt" && cd "$HOME/brigade-essai-wt"
claude -p 'With Bash, return the raw output of: touch ~/brigade-essai ; touch ~/brigade-essai-wt/ok ; ls ~/.ssh ; cat ~/.claude/.credentials.json ; curl -sS -o /dev/null -w "%{http_code}" https://example.com https://registry.npmjs.org' \
  --permission-mode dontAsk --setting-sources '' \
  --settings "$(node <repo>/runtime/src/bac-a-sable/verifier.ts --settings "$HOME/brigade-essai-wt" registry.npmjs.org)"
```

Expected: `~/brigade-essai`, `~/.ssh` and the credentials fail (`Operation not permitted`);
`~/brigade-essai-wt/ok` is created; `example.com` is refused; `registry.npmjs.org` answers `200`.

#### Moving a project's kitchen, whenever you want

The main station — the one that runs a project's kitchen, manager and pass — is chosen when the
project is added ("Adding a project to a station from the app, without a terminal", in
[`station-machine.md`](station-machine.md)); **that choice commits to nothing**: the kitchen can be
moved afterwards to this computer, to its box or to another station, without removing or re-adding the
project. The app launches the operation (`runtime/src/demenagement/demenager.ts`):

```bash
BRIGADE_STATION_DIR=<the directory of this Mac's station> \
  node runtime/src/demenagement/demenager.ts <project> <gist of the target station> <gist>…
```

The gists are those of the chef's stations. It returns a JSON line —
`{"moved":true,"project":"parade","from":"box","to":"mac","askedAt":"…"}` (code 0), or
`{"moved":false,"said":"<a sentence>"}` (code 1, nothing changed); 2, badly called; 3, GitHub could be
neither read nor written. It writes only two requests (`brigade-projets.json`): `remise` on the
station the kitchen is leaving, `reprise` on the one that takes it over (field names stay French); the
app must keep them as they are when it rewrites these requests, or the move becomes an ordinary change
of main station. The rest happens **through the stations' gists**, in three steps
(`runtime/src/projets/tenir.ts`):

1. **The target station says it is ready**, or why it cannot be: its Apps authorized on the
   repository, the repository cloned, and, on this computer, the sandbox usable. Its tracking file
   says so (`bascule.etape`: `acceptee`, or `refusee` and the reason).
2. **The station it is leaving, only then, stops**: it removes the project's line (its kitchen closes,
   no cook leaves any more), proves by its lock that no kitchen holds it, stops every cook in flight
   and waits for its death, then publishes its state in its gist (`brigade-remise-<project>.json` and
   its parts): `remise`. Until the other is ready, it serves as before (`served by box; moving to mac
   is asked …`).
3. **The target station lays down that state, then opens it**: its kitchen starts on the log received
   (`recue`). A state it kept from before is set aside (`etat/.<project>.avant-<time>`), never
   overwritten; the ticket that had prepared the repository follows it, and none reopens.

The values `acceptee`, `refusee`, `remise` and `recue` of `bascule.etape` stay French.

**What follows the project: its whole log** (tickets and rail, grants, the chef's decisions, history);
the move adds only `kitchen.moved`. **A ticket in progress is not lost**: its cook is stopped
(`cook.exited`, `outcome: stop`, `cause: move` — no failure, nothing for the breaker), the ticket goes
back to the rail, and the station that takes over takes it up.

**Never two kitchens at once.** The handing over waits for the kitchen to be closed (lock free) and its
cooks dead; the target only opens its own once the handing over is published. A station that has
handed over a project does not reopen it on its own (`it was handed over to mac … move it back to
bring it here`): it only comes back through a move in the opposite direction.

**To this computer, not without a sandbox** ("A local kitchen", above). The command first plays the
check of `bac-a-sable/verifier.ts`: unavailable, it refuses with its reason and writes nothing; the
computer's station replays it before saying it is ready (`refusee`), and the other station still
serves the project. A refused or not yet accepted move can be taken back by moving the project to the
station that still serves it; once accepted, the command refuses another move of the project until the
target serves it.

**Where each project cooks** is read in each station's tracking file (`brigade-projets-suivi.json`):
`station` (`nom`, `locale`: the station of the chef's computer) and per project `cuitSur` (the station
where it cooks, as it knows it) and `ici` (it cooks on this computer). These names stay French.

**What is not guaranteed by a move.** Does not travel: the raw streams (`runs/`), the worktrees, the
clone. A cook stopped in flight restarts from the base, or from its branch on the origin if pushed
(`travail-conserve.ts`); what a box cook committed without pushing stays in the box's clone. The log
travels compressed through the gist: beyond 10 MB the handing over is refused and the old kitchen
stays closed, retried at each read. The state kept on the old station is frozen: a command typed there
no longer reaches the kitchen. Declared stations travel as they are: the chef redeclares them
(`brigade <project> station stations …`, [`station.md`](station.md)).

**The only direction is station → box, and it is guarded.** A declaration carries no address; in
`runtime/src`, only seven modules touch the network, none toward a station; no program that reaches
another machine is launched by its name; and a complete turn of a remote station opens no connection
from the box. `runtime/test/architecture.test.ts` checks it: a module that opens a connection is an
architecture decision, not an import.

Events: `remote.asked` (`station`, `verb`, payload) and `remote.answered` (`ok`, or `refusal` among the
above plus `late`, `unknown-run`, `invalid`; `said`, `stop`); `station.present` / `station.absent`
(`presenceMs`, `lastSeen`); `station.sandbox` (`available`, `reason`, `version`); `kitchen.moved`
(`from`, `to`, `askedAt`, `cooks`), the last fact of the state handed over.
