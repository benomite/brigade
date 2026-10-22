### A remote station pulls its work

**The chef's workstation connects to the box, never the other way round.** The box cannot launch a
cook on the chef's machine and has no path to their workstation. A station that runs somewhere other
than on the runtime's machine — `mac/claude`, with the chef's connected Chrome — therefore declares
itself `distante` (the setting word stays French until the runtime is translated), and **it is the
one that comes**: it announces itself, claims a ticket, renews its lease, hands back its delivery.
This chapter describes the box side; the program that plays the station on the workstation (the
app's runner) lives in `app/`.

```bash
brigade <project> station stations box/claude:30:code,mac/claude:1:chrome-connecté:distante
```

**One single entry point: the box's gesture**, launched by the station from its workstation —
`ssh <host> brigade <name> pull <station> <request>`. The gesture opens no connection: it writes the
request to the project's log (`remote.asked`), the running runtime reads it when it wakes (within a
second) and answers the same way (`remote.answered`). It returns the answer as **JSON, on one line**,
and its exit code says the rest:

| Request | What it does | Answer |
|---|---|---|
| `pull <station> announce [--sandbox <json>]` | the station says it is there — and, with `--sandbox`, what it knows of its workstation's sandbox | what it provides, its cap on cooks, the presence delay, the lease duration, the guardrail caps |
| `pull <station> claim [--sandbox <json>]` | takes a ticket, if there is one for it — `--sandbox`, as for `announce` | `mission` — the ticket, the run, the branch to create (`cook/<run>`, from `base`) or to resume (`resumes`, a send-back from the pass), the calibration, the cook's brief and the arguments of `claude`, the caps, the lease deadline — or `mission: null`, and `held`: what holds it back |
| `pull <station> renew <run> --proof <fingerprint> --turns <n> --tokens <n>` | shows that the cook has worked, and what it has consumed | the new lease deadline |
| `pull <station> return <run> --end livre\|echec [--reason <reason>] --turns <n> --tokens <n>` | hands the ticket back; the cook's last message on standard input | what the box kept: `done`, or `failed` and why |

The values `livre` and `echec` of `--end` stay French until the runtime is translated (`runtime/src/tirer-cli.ts`).

| Code | Meaning |
|---|---|
| `0` | the request is served |
| `1` | it is refused: `refusal` says why, `said` says it in plain words — and **`stop`**, when the cook is to be stopped (see below) |
| `2` | the gesture is badly written: nothing is asked of the box |
| `3` | the box did not answer — no runtime is running, or it did not answer within thirty seconds: nothing can be assumed about what it did with the request |

**The rules are those of a box cook, not rules of their own.** A cook on the chef's workstation is
not a privileged cook:

- **It only receives the ticket it can cook**: the first one, in service order, whose card asks only
  for things it provides (see "The capabilities a ticket asks for" in [`station.md`](station.md)) —
  never another, even if it waits in front. And, with no partition on its workstation, **a ticket
  that asks for one of its capabilities**: an ordinary ticket only comes to it if it is declared
  `distante+ordinaires`, its workstation having the sandbox (see below). Only a station **declared
  `distante`** pulls: an unknown name (`unknown-station`) or the name of a box station (`not-remote`)
  is refused, and does not count as presence.
- **The bounds of a taking are the same**: the chef's "stop", the breaker, the red base (only its
  repair ticket leaves, and from a station of the box), its quota, its cap on cooks (`run station --
  cooks <N>` sets it too), the zones held by the cooks in flight, from here or from elsewhere. A
  ticket that is not calibrated or whose card is unreadable is refused the same way, on its issue.
  The intake (`BRIGADE_MAX_SETUPS`), the machine guard and the arbiter between projects do not hold
  it back: they guard **this** machine, and its cook weighs on its own.
- **Its cook is launched by the guardrails**, like any other (`cook.launched`, with `remote: true`
  and the same `limits`) — with no process here: the box can neither signal it nor read its stream.
  It therefore holds the four caps on what it has: **turns and tokens** on the measure the station
  reports at each renewal (the same judgement as for a box cook, in the same code), **duration** on
  its own clock since the launch, **idleness** when that measure no longer moves — or none arrives
  any more. The tick's reading (`cook.progressed`), the chef's "stop", the end (`cook.exited`) and the
  breaker's count are those of any cook.
- **The lease is only renewed on a proof of work**: `--proof` carries the fingerprint of the cook's
  worktree — the head of its branch and the state of its files, which the box station reads itself in
  its own. With no proof, or on the **same** fingerprint as the time before, the renewal is refused
  (`no-progress`): neither the station's presence nor what its cook consumes holds a ticket. The
  lease then falls at its deadline, and the cook is stopped (`guard.tripped`, `reason: lease`) — at
  mid-lease, `cook.stalled` had signalled it.
- **"Stopping" a remote cook means accepting nothing more from it.** The box has nobody to signal: the
  end is written to the log at once, the ticket goes back to the rail, and the station learns it at
  its next request — refusal `stopped`, with `stop`: `turns`, `tokens`, `duration`, `idle`, `lease`,
  `stop` (the chef, or the ticket left its hands) or `interrupted` (the runtime restarted: like those
  of the box, its cooks do not survive it). It is up to the station to stop its own; what the cook
  would deliver afterwards is not received.
- **It receives nothing more than a box cook**: no project secret, no GitHub token, no grant. The
  brief and the arguments of `claude` are those a box cook would have received for this ticket — the
  same forbidden tools. What its workstation can do otherwise (its `gh`, its browser) is its own: the
  box neither gives nor guarantees any of it.
- **Its delivery goes through the pass, the same one.** The cook does not push: it is the station that
  pushes `cook/<run>` **to the origin** (GitHub), then hands back (`--end livre`). The box fetches the
  branch from the origin — never from the workstation —, looks in it for the shape of Claude's
  credentials, opens the PR, writes the report (`cook.reported`) and sends the ticket to the pass:
  same gates, same reviewer, same `merge` grant, same send-backs. With no commit on the origin, what
  the cook delimited in its last message is its deliverable (`no-diff`); with nothing delimited, it
  delivered nothing (`no-deliverable`). A send-back goes to the first station that can cook the
  ticket, from here or from elsewhere: its branch is on the origin.
- **If its workstation is closed or asleep in the middle of a cook, nothing it pushed is lost.** Its
  station goes quiet, its lease falls (or its idleness cap), and the ticket goes back to **queued**.
  Before handing it back to service, the box rereads the cook's branch on the origin: if it carries
  commits beyond the base, that is the **kept work** — the report says so (`cook.reported`, `kept`:
  its commits) and so does the issue. The next cook **restarts from it**, instead of starting over
  from zero: on the box, in a worktree attached to that branch as the origin carries it; on a remote
  station, with the branch in its mission (`resumes`, `returns: 0` — it is not a send-back). Its
  brief tells it to finish what is started, and its launch names the cook it resumes
  (`cook.launched`, `continues`). Nothing on the origin: it starts from the base, like a first cook —
  a box station rereads the origin just before leaving, in case the station had pushed in the
  meantime. A branch that carries the shape of Claude's credentials is never resumed. A send-back from
  the pass comes first: its branch is that of the delivery. When it wakes, the station learns at its
  next request that its cook is stopped (`stopped`, `lease`); what it would deliver is no longer
  received, and the ticket, which the box may have taken up again, never has more than one cook at a
  time. The runner only pushes at delivery: a cook lost before it delivered has, today, left nothing
  on the origin.

**Presence: a remote station that has not shown up recently is absent.** Any request shows it. Past
the presence delay (`BRIGADE_PRESENCE_MINUTES`, two minutes by default) without receiving one, the
runtime writes it (`station.absent`); at the next one, `station.present`. **It is not a failure** —
its workstation is off, or elsewhere:

- the tickets **that only it can cook** — all the stations that provide what they ask for are remote
  and absent — are **86**, reason `station-absent: mac/claude`, with no return time, no cook, no
  failure counted. They hold neither a place nor a zone;
- **the others leave**: a box station that can cook a ticket takes it as before;
- as soon as it shows up, they go back to queued on their own (`ticket.released`, reason
  `station-present`), and it can claim them;
- the issue learns it **only once**: a station that comes and goes does not write there at every
  absence. `status` says it in the `awaiting` block, and `station` on its `presence` line:

  ```
  #16  for 3 min  station absent — `mac/claude` has not shown up lately — this is not a failure, and there is nothing to do on the box: the ticket starts again on its own as soon as the station shows up (its workstation on, its runner started)
  ```

#### Ordinary tickets on the chef's workstation

A remote station runs **with no partition**, on the chef's workstation: a cook there would read what
their account reads — the `ssh` key to the box, their production access. By default, it therefore
takes **only the tickets that ask for one of its capabilities**, as before. The chef can make it
take the **ordinary tickets** too — those whose card asks for nothing — by declaring it
`distante+ordinaires` (the setting word stays French until the runtime is translated); its **cap on
cooks** is then the Mac's limit, ordinary tickets included — the one it declares: the box does not
see the Mac's cores (`run station -- cooks <N>` sets it too):

```bash
brigade <project> station stations box/claude:30:code,mac/claude:2:chrome-connecté:distante+ordinaires
```

**An ordinary ticket only leaves there inside Claude Code's sandbox** (`runtime/src/bac-a-sable/`).
The station says so at each `announce` and `claim`, by `--sandbox <json>`: the object that the
probe returns, played on its workstation by its app —
`node runtime/src/bac-a-sable/sonder.ts <worktrees> [<cache>…]`, where `<worktrees>` is the
directory where the workstation puts the worktrees of the project's cooks. When available, it carries
the version of its `claude`, the account's directory, that directory and the project's caches; when
unavailable — not macOS, no Seatbelt (`/usr/bin/sandbox-exec`), a `claude` too old or silent —, the
reason.

- **Setting and sandbox**: the box lends it an ordinary ticket, and writes the configuration for that
  cook — it only writes in `<worktrees>/<run>` and the project's caches, reads neither `~/.ssh` nor
  the chef's credentials, and only reaches the hosts of the project's network list (the one its
  integration branch declares). The mission carries `sandbox: true`, and its arguments of `claude`
  are those of a box cook whose `--permission-mode bypassPermissions` gives way to
  `--permission-mode dontAsk --settings <the configuration>`: the station launches them as they are.
  `cook.launched` also carries `sandbox: true`. The configuration also sets `NODE_USE_ENV_PROXY=1`
  (its `env`): the sandbox only lets a command out through its proxy (`HTTPS_PROXY`), and the
  startup of pnpm 10 checks its own identity against `registry.npmjs.org` with Node's `fetch`,
  which ignores those variables without it — `pnpm <script>` then died of
  `ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE` although the host is in `reseau` (#1320). **Not
  yet reproduced on a Mac with pnpm 10**: what a test proves (`configuration.test.ts`) is that
  a real Node launched with this environment sends its request through the proxy, and not
  without it. To confirm on the Mac: a cook on a project whose `reseau` lists
  `registry.npmjs.org`, then `pnpm --version`, `pnpm install`, `pnpm format:check`.
- **Setting without a sandbox** — or a station that says nothing about it, or a workstation whose
  configuration does not hold (worktrees where a cook must read nothing): **it takes no ordinary
  ticket**. The box writes it (`station.sandbox`, with the reason), says it in the runtime's output
  when it changes, and `station` shows it on its `ordinary tickets` line (`NONE TAKEN — sandbox
  unavailable since …: <reason>`). Ordinary tickets leave on the box's stations.
- **In every case**, the tickets that ask for its capabilities stay taken as before, bare.

**An ordinary ticket only leaves for the Mac when the box is saturated** (#853): all the box's
stations are at their cap on cooks, or its machine can take no more (`station.saturated`) — read at
the moment the Mac claims. As long as the box has room, it keeps its ordinary tickets, even when it
ramps up in steps after a start (`ramp`) or is preparing worktrees. Held back for another reason —
the "stop", the breaker, a red base, its Max connection, its quota, a blocked setup —, it is not
saturated, and its ordinary tickets wait for it. With no station on the box, the Mac takes them as
soon as it has the setting and the sandbox. The `ordinary tickets` line of `station` says it: `taken
when the box is saturated, each cook inside the Claude Code sandbox…`.

The state can also be read in `facts`, field `stations` (see "Facts, for a program" in
[`etat-et-mesures.md`](etat-et-mesures.md)): it is what the app displays.

#### A second station of the project, which cooks alongside the first

*Ticket #1287.* A station declared `distante+ordinaires` is a **backup**: it takes ordinary tickets
only once the box can take no more. A station added to the project as **one more station** is not a
backup: it cooks **at the same time** as the first. The chef declares it `distante+ensemble` (the
setting word stays French until the runtime is translated):

```bash
brigade <project> station stations box/claude:3:code+raisonnement,mac/claude:2:code+raisonnement:distante+ensemble
```

- **It takes the project's tickets as soon as it has room**, each station up to its own cap on
  cooks: the box takes the tickets it can when it wakes, the second station receives at its `claim`
  the first one, in service order, that it can cook — ordinary tickets included, **whether the box is
  saturated or not**. A box that ramps up in steps, prepares worktrees or is held by its own
  connection or quota does not hold it back.
- **A ticket is never taken twice.** Every taking is written to the project's log by the runtime that
  serves it, one request at a time: a ticket the second station holds is not taken by the box, and two
  stations that claim at the same moment receive two different tickets — or nothing, at their cap.
- **Stopping or losing one does not stop the other.** The chef stops the cooking on one station
  (`station -- stop <station>`): the other keeps taking. The box's Max connection drops, or its quota
  runs out: the second station, which has its own, keeps taking — a backup would wait. The second
  station goes quiet: its lease falls, its ticket goes back to the rail, the box takes it up, and keeps
  taking the new ones. The runtime itself is not shared: if the first station's machine stops, its
  kitchen — rail, manager, pass — stops with it, and no station takes anything until it is back.
- **The first station keeps the manager and the pass.** They run where the kitchen runs; every
  station cooks, none other runs them. The second station receives only cooks — `announce`,
  `claim`, `renew`, `return` —, and its deliveries go through the first station's pass, judged by
  its reviewer, like any other.
- **The same guards as `ordinaires`.** An ordinary ticket only leaves for another machine inside the
  Claude Code sandbox of its workstation: with no sandbox said, or an unavailable one, it takes no
  ordinary ticket, only those that ask for one of its capabilities.

`station` says it on the `ordinary tickets` line (`taken alongside the box's stations, as one more
station of the project — not only when the box is saturated — …`), and `facts` in the `ensemble`
field of `stations`.

**What is not done yet.** The second station still has to reach the kitchen: today, only through the
`pull` gesture (`ssh <host> brigade <project> pull …`), which the app's runner plays for a project
it reaches by `ssh`. A station the app pairs through its gist and adds to a project as not its main
one (`secondaire`, in [`station-machine.md`](station-machine.md)) is not declared in the project's
log and pulls nothing yet.

#### A local kitchen: all its cooks in the sandbox

The tickets lent by the box are not the only ones that go through macOS's sandbox. **A project whose
kitchen runs on the chef's Mac** — in the station its app launches
(`runtime/src/station/cuisine.ts`) — **launches all its cooks there, without exception**: every
`claude` its kitchen launches goes into Claude Code's sandbox — a ticket's **cook**, the closing
pass's **closer**, the **pass's reviewer**, the **manager's judgement**
(`runtime/src/bac-a-sable/local.ts`). A kitchen is local when its station runs under macOS: the box
is never one, and its partition (`bwrap`) guards it.

- **The same policy as for a lent ticket**, not another: the configuration of
  `runtime/src/bac-a-sable/configuration.ts`, written for the directory where the launch works —
  its worktree for a cook, a closer or a reviewer, the temporary directory for a judgement. It only
  writes there and in the project's caches, reads neither `~/.ssh` nor the chef's credentials, and
  only reaches the hosts of the project's network list (`.claude/brigade/reseau` of its integration
  branch, reread at each launch; unreadable, the base alone: Anthropic and GitHub). A cook's
  `--permission-mode bypassPermissions` gives way to `--permission-mode dontAsk --settings <the
  configuration>`; the reviewer and the judgement, which had no mode, receive them in front of
  `--setting-sources`.
- **The project's caches** are named in `BRIGADE_SANDBOX_CACHES` (absolute paths separated by `:`, on
  the project's line or in the station's environment); none by default.
- **Where its cooks work: the station's workshop** (*ticket #1176*). The app puts the station under
  `~/.config/brigade/station`, which no cook reads or writes: its log, its decisions, its lock stay
  there, out of reach. The project's git — **its clone and its cooks' worktrees** — therefore lives
  elsewhere, in the workshop: `~/.local/share/brigade/station/clones/<project>` and
  `~/.local/share/brigade/station/worktrees/<project>/<run>` (`runtime/src/station/configuration.ts`,
  `atelierDeLaStation`). A cook only writes in **its** worktree; it neither reads nor writes `~/.ssh`,
  `~/.config/brigade` or the chef's credentials. **No setting**: the workshop is deduced from where
  the station sits — placed outside everything a cook must not read, or on a server, the station
  keeps everything under its directory, as before (`clones/<project>`, `etat/<project>/worktrees`).
  The station gives it to each project (`BRIGADE_REPO_DIR`, `BRIGADE_WORKTREES_DIR`); a line does not
  set `BRIGADE_WORKTREES_DIR`, and the clone a line names (`BRIGADE_REPO_DIR=…`) stays its own.
- **A project served before the workshop moves there on its own**, before its kitchen opens
  (`runtime/src/station/atelier.ts`): its clone and its worktrees are **renamed as they are** —
  branches, commits and uncommitted files included —, then `git worktree repair` hangs each worktree
  back on its clone. Nothing is copied, nothing is removed, under the project's lock. The service
  log says it, one line per thing moved:
  `déménagé dans l'atelier de la station — clone : <old place> → <workshop>`. The worktree of a cook
  from a previous life is then tidied as always: what lay in it is committed to its branch, then it
  is removed. What cannot be moved — another clone already in the workshop, another volume, a
  worktree whose `.git` file does not point to the clone — **stays where it is**, and says so
  (`pas déménagé dans l'atelier de la station — …`); the kitchen opens all the same. These lines
  stay French until the runtime is translated (`runtime/src/station/station.ts`,
  `runtime/src/station/atelier.ts`).
- **Without a sandbox, the kitchen does not open**: no cook leaves there bare. The station refuses
  the project, and the reason names what is missing, in one sentence:
  `sur ce Mac, chaque cook part dans le bac à sable, et il n'est pas utilisable — <reason>`. Once
  fixed (a `claude update`, for example), the project reopens at the station's restart, or when its
  line changes. Once open, the kitchen says so in the service log:
  `bac à sable — chaque \`claude\` de la cuisine (cook, closer, reviewer, manager) part dans celui de Claude Code (claude 2.1.300) : …`.
  Both sentences stay French until the runtime is translated (`runtime/src/bac-a-sable/local.ts`).
- **What it does not keep**: what the runtime itself launches outside `claude` — the worktree's
  setup, the gates, a delivery's servers. Those are the repository's scripts, not the model.

**Is the sandbox usable on this Mac?** The check says so, before cooking a project there:

```bash
BRIGADE_STATION_DIR=<the station's directory> node runtime/src/bac-a-sable/verifier.ts
```

It writes `ok` (code 0), or what is missing in one sentence (code 1) — not macOS, no Seatbelt
(`/usr/bin/sandbox-exec`), a `claude` too old or silent, `HOME` missing, a relative cache, or
worktrees where a cook must read nothing; 2, it is badly called. The `claude` tried is the one the
station launches (`BRIGADE_CLAUDE_BIN`, otherwise `claude`). It tries the station's places — a trial
cook in its workshop: **a station placed under `~/.config/brigade`** — the app's default directory —
**holds**, its worktrees living under `~/.local/share/brigade/station`. Before the workshop (#1176),
it did not hold, and every project was refused. The sentences of the check stay French until the
runtime is translated (`runtime/src/bac-a-sable/local.ts`, `detection.ts`, `configuration.ts`):

```
la configuration du bac à sable ne tient pas sur ce Mac — /Users/chef/.config/brigade/station/etat/essai : un cook n'y écrirait pas sans toucher à /Users/chef/.config/brigade, qu'il ne doit pas même lire
```

**Checking by hand**, on the Mac, what the tests cannot do (neither macOS, nor a real `claude`, nor
network): `--settings` returns the configuration of a `claude` launched in a directory, the network
list being the given hosts; launched with it, `claude` must refuse what a cook does not do. The trial
directory is under the account, like a station worktree: `/tmp` is, under macOS, only a link to
`/private/tmp`, and the configuration names paths as they are.

```bash
mkdir -p "$HOME/brigade-essai-wt" && cd "$HOME/brigade-essai-wt"
claude -p 'Run these commands one by one with Bash and return their raw output: touch ~/brigade-essai ; touch ~/brigade-essai-wt/ok ; ls ~/.ssh ; cat ~/.claude/.credentials.json ; curl -sS -o /dev/null -w "%{http_code}" https://example.com ; curl -sS -o /dev/null -w "%{http_code}" https://registry.npmjs.org' \
  --permission-mode dontAsk --setting-sources '' \
  --settings "$(node <repo>/runtime/src/bac-a-sable/verifier.ts --settings "$HOME/brigade-essai-wt" registry.npmjs.org)"
```

Expected: `touch ~/brigade-essai` fails (`Operation not permitted`) and the file does not exist;
`~/brigade-essai-wt/ok` is created; `ls ~/.ssh` and `cat ~/.claude/.credentials.json` fail
(`Operation not permitted`); `example.com`, off the list, is refused (connection refused by the
sandbox's proxy, no `200` code); `registry.npmjs.org`, on the list, answers `200`.

#### Moving a project's kitchen, whenever you want

A project's main station — the one that runs its kitchen, its manager and its pass — is chosen when
the project is added ("Adding a project to a station from the app, without a terminal", in
[`station-machine.md`](station-machine.md)); **that choice commits to nothing**: the kitchen can be
moved afterwards to this computer, to its box or to another station, without removing or re-adding
the project, and a project added tomorrow moves the same way. The app launches the operation on the
chef's computer (`runtime/src/demenagement/demenager.ts`):

```bash
BRIGADE_STATION_DIR=<the directory of this Mac's station> \
  node runtime/src/demenagement/demenager.ts <project> <gist of the target station> <gist>…
```

The gists are those of the chef's stations. It returns a JSON line —
`{"moved":true,"project":"parade","from":"box","to":"mac","askedAt":"…"}` (code 0), or
`{"moved":false,"said":"<a sentence>"}` (code 1), and nothing has changed; 2, it is badly called; 3,
GitHub could be neither read nor written. It writes only two requests (`brigade-projets.json`):
`remise` on the station the kitchen is leaving, `reprise` on the one that takes it over (these two
field names stay French until the runtime is translated) — the app must keep them as they are when it
rewrites these requests, otherwise the move in progress becomes an ordinary change of main station.
The rest happens between the two, **through their gists** — neither reaches the other —, in three
steps (`runtime/src/projets/tenir.ts`):

1. **The target station says it is ready**, or says why it cannot be. Ready: its Apps authorized on
   the repository, the repository cloned — and, on this computer, the sandbox usable. Its tracking
   file says so (`bascule.etape`: `acceptee`, or `refusee` and the reason); nothing else opens on its
   side.
2. **The station it is leaving, only then, stops**: it removes the project's line — its kitchen
   closes, **no cook leaves from it any more** —, proves by its lock that no kitchen holds it any
   more, stops every cook still in flight and waits for its death, then publishes its state in its
   gist (`brigade-remise-<project>.json` and its parts): `remise`. As long as the other is not ready,
   it serves it as before — `served by box; moving to mac is asked: it cooks here until mac is ready
   to take it over`.
3. **The target station lays down that state, then opens it**: its kitchen starts on the log
   received (`recue`). A state it kept from a previous time is set aside
   (`etat/.<project>.avant-<time>`), never overwritten; the ticket that had prepared the repository
   follows it, and none reopens.

The values `acceptee`, `refusee`, `remise` and `recue` of `bascule.etape` stay French until the runtime
is translated (`runtime/src/projets/tenir.ts`).

**What follows the project: its whole log** — its tickets and their rail, its grants, the chef's
decisions (declared stations, calibration, caps), its history. The same ones, identically: the move
adds only one fact, `kitchen.moved`. **A ticket in progress is not lost**: its cook is stopped by the
move (`cook.exited`, `outcome: stop`, `cause: move`) — neither a failure nor a breakdown, nothing for
the breaker —, the ticket goes back to the rail, and the station that takes over the project takes
it up like any other.

**Never two kitchens at once.** The handing over waits for the kitchen to be closed (its lock free)
and its cooks dead; the target station only opens its own once the handing over is published. A
station that has handed over a project does not reopen it on its own, even if its request makes it
the main one again: it refuses it (`it was handed over to mac … move it back to bring it here`) — it
only comes back through a move in the opposite direction.

**To this computer, not without a sandbox** ("A local kitchen: all its cooks in the sandbox", above). The command first plays the
check of `bac-a-sable/verifier.ts`: unavailable, it refuses with its reason, in one sentence, and
writes nothing. The computer's station replays it before saying it is ready: a request that reached
it otherwise is refused the same way (`refusee`), and the station it was to leave still serves it.
Refused, or not yet accepted, a move can be taken back: moving the project to the station that still
serves it erases the request. Once accepted, it goes to its end: the command refuses another move of
the same project as long as the target station does not serve it.

**Where each project cooks** is read in each station's tracking file (`brigade-projets-suivi.json`,
the one the app already reads): `station` (`nom`, `locale`: the station of the chef's computer), and
per project `cuitSur` — the station where it cooks, as it knows it — and `ici` — it cooks on this
one, and this is that computer. These field names stay French until the runtime is translated.

**What is not guaranteed.** What does not travel: the cooks' raw streams (`runs/`), the worktrees,
the clone (the target station clones the repository). A cook stopped in flight therefore restarts
from the base — or from its branch on the origin if a remote station had pushed it there
(`travail-conserve.ts`): what a box cook had committed without pushing stays in the box's clone,
branch `cook/<run>`. The log travels compressed, in parts, through the gist: beyond 10 MB
compressed, the handing over is refused and the kitchen stays closed on the station it was leaving —
the handing over is retried at each read. A remote station's cook in flight is not reached: it is
stopped in the log, and its station learns it at its next request, if a kitchen answers there. After
the move, the state kept on the old station is frozen: a command typed there (`brigade <project> …`
on the box) no longer reaches the kitchen. The declared stations travel as they are, like the other
decisions: the station put there at the add keeps the name of the machine at the time (`box/claude`)
and its cooks leave from the station that serves the project, under that name; a station marked
`distante` that becomes the main one stays marked so — the chef redeclares them (`brigade <project>
station stations …`, "Declaring the stations", [`station.md`](station.md)).

**The only direction is station → box, and it is guarded.** A declaration carries no address; in
`runtime/src`, only seven modules touch the network, none toward a station (the arbiter and a
delivery's server on `127.0.0.1`, the door and its probe, GitHub's API); no program that reaches
another machine is launched there by its name; and a complete turn of a remote station opens no
connection from the box. All four are checked in `runtime/test/architecture.test.ts`: adding a module
there that opens a connection is an architecture decision, not an import.

**What is not guaranteed.** The proof of work is what the station says of its worktree: the box does
not see it, it can only note that a fingerprint has changed — like the measure of turns and tokens,
it is worth the trust placed in the workstation's runner, no more. A remote cook stopped by a
guardrail delivers nothing, even if it had committed: nothing is harvested from a workstation the
box does not reach. And the shape of Claude's credentials recognised in a remote delivery holds it
back from the pass, but its branch **is already on the origin** — the station pushed it there: the
issue says to delete it.

| Event | Meaning |
|---|---|
| `remote.asked` | A remote station's request, written by its gesture: `station`, `verb` (`announce`, `claim`, `renew`, `deliver`), and what it carries |
| `remote.answered` | The runtime's answer, on the ticket when it concerns one: `ok`, or `refusal` (`unknown-station`, `not-remote`, `late`, `unknown-run`, `stopped`, `no-progress`, `invalid`), `said`, `stop` |
| `station.present`, `station.absent` | A remote station showed up after an absence; it has not shown up since `presenceMs` (`lastSeen`). Off ticket |
| `station.sandbox` | What a remote station says of its workstation's sandbox, when it changes: `available`, `reason` (why it is not, `null` if it is), `version` (its `claude`, `null` if it is not). Off ticket |
| `ticket.86` | Reason `station-absent: <station>`: only an absent remote station can cook this ticket. With no return time; `ticket.released`, reason `station-present`, when it returns |
| `kitchen.moved` | The project's kitchen moves: `from`, `to` (the stations), `askedAt` (the instant of the request, which makes it recognisable), `cooks` (the runs stopped in flight). Written by the station it is leaving, last fact of the state handed over. Off ticket |
| `cook.exited` | With `cause: move`: the cook was stopped by a move, `outcome: stop` — its ticket goes back to the rail, with no failure |
