### A remote station pulls its work

**The chef's workstation connects to the box, never the other way round.** The box cannot launch a cook on
the chef's machine and has no path to their workstation. A station that runs somewhere other than on the runtime's
machine — `mac/claude`, with the chef's logged-in Chrome — therefore declares itself `distante` (remote), and **it is
the one that comes**: it announces itself, claims a ticket, renews its lease, returns its delivery. This chapter
describes the box side; the program that plays the station on the workstation (the app's runner) lives in
`app/`.

```bash
brigade <project> station stations box/claude:30:code,mac/claude:1:chrome-connecté:distante
```

**A single entry point: the box action**, run by the station from its workstation —
`ssh <host> brigade <name> pull <station> <request>`. The action opens no connection: it writes
the request to the project's log (`remote.asked`), the running runtime reads it when it wakes (within
a second) and answers the same way (`remote.answered`). It returns the answer as **JSON, on one
line**, and its exit code says the rest:

| Request | What it does | Answer |
|---|---|---|
| `pull <station> announce [--sandbox <json>]` | the station says it is there — and, with `--sandbox`, what it knows about its workstation's sandbox | what it provides, its cap on cooks, the presence delay, the lease duration, the guardrails' caps |
| `pull <station> claim [--sandbox <json>]` | takes a ticket, if there is one for it — `--sandbox`, as for `announce` | `mission` — the ticket, the run, the branch to create (`cook/<run>`, from `base`) or to resume (`resumes`, a send-back from the pass), the calibration, the cook's instruction and the arguments of `claude`, the caps, the lease deadline — or `mission: null`, and `held`: what holds it back |
| `pull <station> renew <run> --proof <fingerprint> --turns <n> --tokens <n>` | shows that the cook has worked, and what it has consumed | the new lease deadline |
| `pull <station> return <run> --end livre\|echec [--reason <reason>] --turns <n> --tokens <n>` | returns the ticket; the cook's last message on standard input | what the box retained: `done`, or `failed` and why |

| Code | Meaning |
|---|---|
| `0` | the request is served |
| `1` | it is refused: `refusal` says why, `said` says it in plain words — and **`stop`**, when the cook is to be stopped (see below) |
| `2` | the action is badly written: nothing is asked of the box |
| `3` | the box did not answer — no runtime is running, or it did not answer within thirty seconds: nothing can be assumed about what it did with the request |

**The rules are those of a box cook, not separate rules.** A cook on the chef's workstation
is not a privileged cook:

- **It only receives the ticket it can cook**: the first, in serving order, for which
  it provides **everything** the card asks for ("The capabilities a ticket asks for") — never any
  other, even if it waits in front. And, without a partition on its workstation, **a ticket that asks for one of its
  capabilities**: an ordinary ticket only falls to it declared `distante+ordinaires`, its workstation
  having the sandbox (see below). Only a station **declared `distante`** pulls: an unknown name
  (`unknown-station`) or that of a box station (`not-remote`) is refused, and does not count as
  presence.
- **The bounds on a taking are the same**: the chef's "stop", the breaker, the red base (only its repair ticket leaves, and from a station here), its
  quota, its cap on cooks (`run station -- cooks <N>` sets it too), the zones held by the
  running cooks, from here or elsewhere. An uncalibrated ticket or one with an unreadable card is refused
  the same way, on its issue. The intake (`BRIGADE_MAX_SETUPS`), the machine guard and the arbiter
  between projects do not hold it back: they guard **this** machine, and its cook weighs on its own.
- **Its cook is launched by the guardrails**, like any other (`cook.launched`, with `remote: true` and
  the same `limits`) — with no process here: the box can neither signal it nor read its stream. It
  therefore holds the four caps on what it has: **turns and tokens** on the measure that the
  station reports at each renewal (the same judgment as for a box cook, in the same
  code), **duration** on its own clock since the launch, **inactivity** when that
  measure no longer moves — or no longer arrives. The tick reading (`cook.progressed`), the chef's
  "stop", the end (`cook.exited`) and the breaker's count are those of any cook.
- **The lease is renewed only on proof of work**: `--proof` carries the fingerprint of the cook's
  worktree — the head of its branch and the state of its files, which the station here reads
  itself in its own. Without proof, or on the **same** fingerprint as last time, the
  renewal is refused (`no-progress`): neither the station's presence nor what its cook
  consumes holds a ticket. The lease then falls at its deadline, and the cook is stopped
  (`guard.tripped`, `reason: lease`) — at half lease, `cook.stalled` had signaled it.
- **"Stopping" a remote cook means accepting nothing more from it.** The box has no one to
  signal: the end is written to the log right away, the ticket returns to the rail, and the station
  learns of it at its next request — refusal `stopped`, with `stop`: `turns`, `tokens`, `duration`,
  `idle`, `lease`, `stop` (the chef, or the ticket left its hands) or `interrupted` (the runtime
  restarted: like the box's, its cooks do not survive it). It is up to the station to stop its own cook;
  what it would deliver afterwards is not received.
- **It receives nothing more than a box cook**: no project secret, no GitHub token, no
  grant. The instruction and the arguments of `claude` are those a box cook would have received for
  this ticket — the same forbidden tools. What its workstation can otherwise do (its `gh`, its
  browser) is its own: the box neither gives nor guarantees anything about it.
- **Its delivery goes through the pass, the same one.** The cook does not push: it is the station that pushes
  `cook/<run>` **to the origin** (GitHub), then returns (`--end livre`). The box fetches the branch from
  the origin — never from the workstation —, looks there for the shape of Claude's credentials, opens the PR, writes
  the report (`cook.reported`) and sends the ticket to pass: same gates, same reviewer, same
  `merge` grant, same send-backs. Without a commit on the origin, what the cook delimited in its
  last message is its deliverable (`no-diff`); with nothing delimited, it delivered nothing
  (`no-deliverable`). A send-back goes to the first station that can cook the ticket, from here or
  elsewhere: its branch is on the origin.
- **Its workstation closed or asleep mid-cook, nothing it pushed is lost.** Its
  station goes silent, its lease falls (or its inactivity cap), and the ticket returns **queued**.
  Before handing it back to service, the box rereads the cook's branch on the origin: if it carries
  commits beyond the base, that is the **preserved work** — the report says so (`cook.reported`,
  `kept`: its commits) and so does the issue. The next cook **resumes from it**, instead of starting over from
  zero: on the box, in a worktree attached to that branch as the origin carries it; on a remote
  station, with the branch in its mission (`resumes`, `returns: 0` — it is not a send-back).
  Its instruction tells it to finish what is started, and its launch names the cook it is
  resuming (`cook.launched`, `continues`). Nothing on the origin: it starts from the base, like a first one
  — a station here rereads the origin just before leaving, in case the station pushed it
  in the meantime. A branch that carries the shape of Claude's credentials is never resumed. A send-back
  from the pass takes precedence: its branch is the delivery's. Once awake, the station learns at its next
  request that its cook is stopped (`stopped`, `lease`); what it would deliver is no longer received,
  and the ticket, which the box may have taken back, never has more than one cook at a time. The runner only pushes
  at delivery: a cook lost before delivering has, today, left nothing on the origin.

**Presence: a remote station that has not shown up recently is absent.** Any request
shows it up. Past the presence delay (`BRIGADE_PRESENCE_MINUTES`, two minutes by default) without
receiving one, the runtime writes it (`station.absent`); at the next one, `station.present`. **This is not
a failure** — its workstation is off, or elsewhere:

- the tickets **that only it can cook** — all the stations that provide what they
  ask for are remote and absent — are **86**, reason `station-absent: mac/claude`, with no return
  time, no cook, no failure counted. They hold neither a place nor a zone;
- **the others leave**: a box station that can cook a ticket takes it as before;
- as soon as it shows up, they return to queued on their own (`ticket.released`, reason
  `station-present`), and it can claim them;
- the issue learns of it **only once**: a station that comes and goes does not write there at each absence.
  `status` says it in the `awaiting` block, and `station` on its `presence` line:

  ```
  #16  for 3 min  station absent — `mac/claude` has not shown up lately — this is not a failure, and there is nothing to do on the box: the ticket starts again on its own as soon as the station shows up (its workstation on, its runner started)
  ```

#### Ordinary tickets on the chef's workstation

A remote station runs **without a partition**, on the chef's workstation: a cook there would read what
their account reads — the `ssh` key to the box, their prod access. By default, it therefore takes **only the
tickets that ask for one of its capabilities**, as before. The chef can have it take the
**ordinary tickets** too — those whose card asks for nothing — by declaring it `distante+ordinaires`;
its **cap on cooks** is then the Mac's limit, ordinary tickets included — the one it
declares: the box does not see the Mac's cores (`run station -- cooks <N>` sets it too):

```bash
brigade <project> station stations box/claude:30:code,mac/claude:2:chrome-connecté:distante+ordinaires
```

**An ordinary ticket only leaves there inside Claude Code's sandbox** (`runtime/src/bac-a-sable/`).
The station says so at each `announce` and `claim`, through `--sandbox <json>`: the object returned by
the probe, run on its workstation by its app —
`node runtime/src/bac-a-sable/sonder.ts <worktrees> [<cache>…]`, where `<worktrees>` is the
directory where the workstation puts the project's cooks' worktrees. When available, it carries the version of
its `claude`, the account directory, that directory and the project's caches; when unavailable — not
macOS, no Seatbelt (`/usr/bin/sandbox-exec`), a `claude` too old or silent —, the reason.

- **Setting and sandbox**: the box lends it an ordinary ticket, and writes the configuration
  for that cook — it writes only in `<worktrees>/<run>` and the project's caches, reads neither `~/.ssh`
  nor the chef's credentials, reaches only the hosts of the project's network list (the one its
  integration branch declares). The mission carries `sandbox: true`, and its arguments for `claude`
  are those of a box cook whose `--permission-mode bypassPermissions` gives way to
  `--permission-mode dontAsk --settings <the configuration>`: the station launches them as they are.
  `cook.launched` also carries `sandbox: true`.
- **Setting without a sandbox** — or a station that says nothing about it, or a workstation whose configuration
  does not hold (worktrees where a cook must read nothing): **it takes no ordinary
  ticket**. The box writes it (`station.sandbox`, with the reason), says it in the runtime's output
  when it changes, and `station` shows it on its `ordinary tickets` line (`NONE TAKEN — sandbox
  unavailable since …: <reason>`). Ordinary tickets go to the box's stations.
- **In all cases**, the tickets that ask for its capabilities stay taken as before, bare.

**An ordinary ticket only goes to the Mac when the box saturates** (#853): all the box's stations
are at their cap on cooks, or its machine can take no more (`station.saturated`) — read at the
moment the Mac claims. As long as the box has room, it keeps its ordinary tickets, even
when it ramps up in steps after a departure (`ramp`) or prepares worktrees. Held back for another
reason — the "stop", the breaker, a red base, its Max connection, its quota, a blocked setup —,
it does not saturate, and its ordinary tickets wait for it. With no station on the box, the Mac
takes them as soon as it has the setting and the sandbox. The `ordinary tickets` line of `station` says
so: `taken when the box saturates, each cook in the sandbox…`.

The state can also be read in `facts`, field `stations` (see "The facts, for a program"): it is
what the app displays.

#### A local kitchen: all its cooks in the sandbox

The tickets lent by the box are not the only ones to go through macOS's sandbox. **A project
whose kitchen runs on the chef's Mac** — in the station that its app launches
(`runtime/src/station/cuisine.ts`) — **launches all its cooks there, without exception**: each `claude`
that its kitchen launches goes into Claude Code's sandbox — the **cook** of a ticket, the
**closer** of the closing pass, the **pass reviewer**, the **manager's judgment**
(`runtime/src/bac-a-sable/local.ts`). A kitchen is local when its station runs under macOS: the
box is never one, and its partition (`bwrap`) guards it.

- **The same policy as for a lent ticket**, not another: the configuration of
  `runtime/src/bac-a-sable/configuration.ts`, written for the directory where the launch works —
  its worktree for a cook, a closer or a reviewer, the temporary directory for a judgment. It
  writes only there and in the project's caches, reads neither `~/.ssh` nor the chef's credentials,
  reaches only the hosts of the project's network list (`.claude/brigade/reseau` of its
  integration branch, reread at each launch; if unreadable, the baseline alone: Anthropic and GitHub). A cook's
  `--permission-mode bypassPermissions` gives way to `--permission-mode dontAsk
  --settings <the configuration>`; the reviewer and the judgment, which had no mode, receive them
  in front of `--setting-sources`.
- **The project's caches** are named in `BRIGADE_SANDBOX_CACHES` (absolute paths separated by
  `:`, on the project's line or in the station's environment); none by default.
- **Where its cooks work: the station's workshop** (*ticket #1176*). The app places the station
  under `~/.config/brigade/station`, which no cook reads or writes: its log, its decisions,
  its lock stay there, out of reach. The project's git — **its clone and its cooks'
  worktrees** — therefore lives elsewhere, in the workshop: `~/.local/share/brigade/station/clones/<project>` and
  `~/.local/share/brigade/station/worktrees/<project>/<run>` (`runtime/src/station/configuration.ts`,
  `atelierDeLaStation`). The cook writes only in **its** worktree; it neither reads nor writes `~/.ssh`,
  `~/.config/brigade` nor the chef's credentials. **No setting**: the workshop is deduced from the
  station's location — placed outside everything a cook does not read, or on a server, the station
  keeps everything under its directory, as before (`clones/<project>`, `etat/<project>/worktrees`). The
  station gives it to each project (`BRIGADE_REPO_DIR`, `BRIGADE_WORKTREES_DIR`); a line does not
  set `BRIGADE_WORKTREES_DIR`, and the clone a line names (`BRIGADE_REPO_DIR=…`) remains its own.
- **A project served before the workshop moves into it on its own**, before its kitchen opens
  (`runtime/src/station/atelier.ts`): its clone and its worktrees are **renamed as they are** —
  branches, commits and uncommitted files included —, then `git worktree repair` reattaches
  each worktree there to its clone. Nothing is copied, nothing is removed, under the project's lock. The
  service log says so, one line per thing moved:
  `déménagé dans l'atelier de la station — clone : <old place> → <workshop>`. The worktree of a
  cook from a previous life is then tidied as always: what lay in it is committed on its
  branch, then it is removed. What cannot be moved — another clone already in the workshop, another
  volume, a worktree whose `.git` file does not point to the clone — **stays where it is**, and
  says so (`pas déménagé dans l'atelier de la station — …`); the kitchen opens anyway.
- **Without a sandbox, the kitchen does not open**: no cook leaves bare. The station refuses the
  project, and the reason names what is missing, in one sentence:
  `sur ce Mac, chaque cook part dans le bac à sable, et il n'est pas utilisable — <reason>`. Once fixed
  (a `claude update`, for example), the project reopens on the station's restart, or when its
  line changes. Once open, the kitchen says so in the service log:
  `bac à sable — chaque \`claude\` de la cuisine (cook, closer, reviewer, manager) part dans celui de Claude Code (claude 2.1.300) : …`.
- **What it does not cover**: what the runtime itself launches outside `claude` — the worktree
  setup, the gates, a delivery's servers. Those are the repository's scripts, not the model.

**Is the sandbox usable on this Mac?** The check says so, before cooking a
project there:

```bash
BRIGADE_STATION_DIR=<station directory> node runtime/src/bac-a-sable/verifier.ts
```

It writes `ok` (code 0), or what is missing in one sentence (code 1) — not macOS, no Seatbelt
(`/usr/bin/sandbox-exec`), a `claude` too old or silent, `HOME` missing, a relative cache, or
worktrees where a cook must read nothing; 2, it is badly called. The `claude` tested is the one
the station launches (`BRIGADE_CLAUDE_BIN`, otherwise `claude`). It tests the station's places —
a trial cook in its workshop: **a station placed under `~/.config/brigade`** — the app's
default directory — **holds**, its worktrees living under `~/.local/share/brigade/station`. Before
the workshop (#1176), it did not hold, and every project was refused:

```
la configuration du bac à sable ne tient pas sur ce Mac — /Users/chef/.config/brigade/station/etat/essai : un cook n'y écrirait pas sans toucher à /Users/chef/.config/brigade, qu'il ne doit pas même lire
```

**The manual check**, on the Mac, what the tests cannot do (neither macOS, nor a real
`claude`, nor network): `--settings` returns the configuration of a `claude` launched in a directory,
the network list being the given hosts; launched with it, `claude` must refuse what a cook does not do.
The trial directory is under the account, like a station worktree: `/tmp` is, under macOS,
only a link to `/private/tmp`, and the configuration names the paths as they are.

```bash
mkdir -p "$HOME/brigade-essai-wt" && cd "$HOME/brigade-essai-wt"
claude -p 'Run these commands one by one with Bash and return their raw output: touch ~/brigade-essai ; touch ~/brigade-essai-wt/ok ; ls ~/.ssh ; cat ~/.claude/.credentials.json ; curl -sS -o /dev/null -w "%{http_code}" https://example.com ; curl -sS -o /dev/null -w "%{http_code}" https://registry.npmjs.org' \
  --permission-mode dontAsk --setting-sources '' \
  --settings "$(node <repository>/runtime/src/bac-a-sable/verifier.ts --settings "$HOME/brigade-essai-wt" registry.npmjs.org)"
```

Expected: `touch ~/brigade-essai` fails (`Operation not permitted`) and the file does not exist;
`~/brigade-essai-wt/ok` is created; `ls ~/.ssh` and `cat ~/.claude/.credentials.json` fail
(`Operation not permitted`); `example.com`, off the list, is refused (connection refused by the
sandbox's proxy, no `200` code); `registry.npmjs.org`, on the list, answers `200`.

#### Moving a project's kitchen, whenever you want

A project's main station — the one that runs its kitchen, its manager and its pass — is
chosen when it is added ("Adding a project to a station from the app"); **this choice commits
to nothing**: the kitchen can later be moved to this computer, to its box or to another station,
without removing or re-adding the project, and a project added tomorrow moves the same way. The app
launches the operation on the chef's computer (`runtime/src/demenagement/demenager.ts`):

```bash
BRIGADE_STATION_DIR=<this Mac's station directory> \
  node runtime/src/demenagement/demenager.ts <project> <target station's gist> <gist>…
```

The gists are those of the chef's stations. It returns a JSON line —
`{"moved":true,"project":"parade","from":"box","to":"mac","askedAt":"…"}` (code 0), or
`{"moved":false,"said":"<a sentence>"}` (code 1), and nothing has changed; 2, it is badly called;
3, GitHub could not be read or written. It writes only two requests (`brigade-projets.json`):
`remise` (handover) on the station the kitchen leaves, `reprise` (takeover) on the one that takes it over — the app must
keep them as they are when it rewrites these requests, otherwise the move in progress becomes an
ordinary change of main station. The rest happens between the two, **through their gists** — neither
reaches the other —, in three steps (`runtime/src/projets/tenir.ts`):

1. **The target station says it is ready**, or says why it cannot be. Ready: its Apps
   authorized on the repository, the repository cloned — and, on this computer, the sandbox usable.
   Its tracking says so (`bascule.etape`: `acceptee`, or `refusee` and the reason); nothing else
   opens on its side.
2. **The station it leaves, only then, stops**: it removes the project's line — its
   kitchen closes, **no more cooks leave from it** —, proves by its lock that no kitchen
   holds it any more, stops each cook still in flight and waits for its death, then publishes its state in its
   gist (`brigade-remise-<projet>.json` and its parts): `remise`. As long as the other is not ready,
   it serves it as before — `served by box; moving to mac is asked…`.
3. **The target station lays down that state, then opens it**: its kitchen starts on the log received
   (`recue`). A state it kept from a previous time is set aside
   (`etat/.<project>.avant-<time>`), never overwritten; the ticket that had prepared the repository follows it, and
   none reopens.

**What follows the project: its whole log** — its tickets and their rail, its grants, the chef's
decisions (declared stations, calibration, caps), its history. The same ones, identically: the
move adds only one fact, `kitchen.moved`. **A ticket in progress is not lost**: its
cook is stopped by the move (`cook.exited`, `outcome: stop`, `cause: move`) — neither failure, nor
breakdown, nothing for the breaker —, the ticket returns to the rail, and the station that takes over the project
takes it like any other.

**Never two kitchens at once.** The handover waits for the kitchen to be closed (its lock free)
and its cooks dead; the target station opens its own only once the handover is published. A station
that has handed over a project does not reopen it on its own, even if its request makes it the main one again:
it refuses it (`it was handed over to mac … move it back to bring it here`) — it returns only through
a move in the opposite direction.

**To this computer, not without a sandbox** ("A local kitchen", above). The command
first runs the check of `bac-a-sable/verifier.ts`: unavailable, it refuses with its reason, in
one sentence, and writes nothing. The computer's station reruns it before saying it is ready: a
request that reached it otherwise is refused the same way (`refusee`), and the station it was to
leave still serves it. Refused, or not yet accepted, a move can be taken back: moving the
project to the station that still serves it erases the request. Once accepted, it goes to its end:
the command refuses another move of the same project as long as the target station does not serve it.

**Where each project cooks** can be read in each station's tracking (`brigade-projets-suivi.json`,
the one the app already reads): `station` (`nom`, `locale`: the chef's computer's station), and per
project `cuitSur` — the station where it cooks, as it knows it — and `ici` — it cooks on
this one, and this is the computer.

**What is not guaranteed.** What does not travel: the cooks' raw streams (`runs/`), the
worktrees, the clone (the target station clones the repository). A cook stopped in flight therefore restarts from the
base — or from its branch on the origin if a remote station had pushed it there
(`travail-conserve.ts`): what a box cook had committed without pushing stays in the box's clone,
branch `cook/<run>`. The log travels compressed, in parts, through the gist: beyond
10 MB compressed, the handover is refused and the kitchen stays closed on the station it was leaving
— the handover is retried at each reading. A remote station's cook in flight is not reached:
it is stopped in the log, and its station learns of it at its next request, if a kitchen answers there.
After the move, the state kept on the old station is frozen: a command typed there
(`brigade <project> …` on the box) no longer reaches the kitchen. The declared stations travel
as they are, like the other decisions: the station set at the time of adding keeps the name of the machine
of the time (`box/claude`) and its cooks leave from the station that serves the project, under that name; a
station marked `distante` that becomes the main one stays marked so — the chef
redeclares them (`brigade <project> station stations …`, "Declaring the stations", `station.md`).

**The only direction is station → box, and it is guarded.** A declaration carries no address;
in `runtime/src`, only seven modules touch the network, none toward a station (the arbiter and
a delivery's server on `127.0.0.1`, the door and its probe, GitHub's API); no program
that reaches another machine is launched there by name; and a full turn of a remote station
opens no connection from the box. The four are checked in
`runtime/test/architecture.test.ts`: adding a module that opens a connection there is an architecture
decision, not an import.

**What is not guaranteed.** The proof of work is what the station says about its worktree: the
box does not see it, it can only observe that a fingerprint has changed — like the measure of
turns and tokens, it is worth the trust placed in the workstation's runner, no more. A remote cook
stopped by a guardrail delivers nothing, even if it had committed: nothing is harvested from a workstation that
the box does not reach. And the shape of Claude's credentials recognized in a remote delivery
holds it back from the pass, but its branch **is already on the origin** — the station pushed it
there: the issue says to delete it.

| Event | Meaning |
|---|---|
| `remote.asked` | A remote station's request, written by its action: `station`, `verb` (`announce`, `claim`, `renew`, `deliver`), and what it carries |
| `remote.answered` | The runtime's answer, on the ticket when it concerns one: `ok`, or `refusal` (`unknown-station`, `not-remote`, `late`, `unknown-run`, `stopped`, `no-progress`, `invalid`), `said`, `stop` |
| `station.present`, `station.absent` | A remote station showed up after an absence; it has not shown up since `presenceMs` (`lastSeen`). Off ticket |
| `station.sandbox` | What a remote station says about its workstation's sandbox, when it changes: `available`, `reason` (why it is not, `null` if it is), `version` (its `claude`, `null` if it is not). Off ticket |
| `ticket.86` | Reason `station-absent: <station>`: only an absent remote station can cook this ticket. With no return time; `ticket.released`, reason `station-present`, when it returns |
| `kitchen.moved` | The project's kitchen moves: `from`, `to` (the stations), `askedAt` (the instant of the request, which makes it recognized), `cooks` (the runs stopped in flight). Written by the station it leaves, last fact of the handed-over state. Off ticket |
| `cook.exited` | With `cause: move`: the cook was stopped by a move, `outcome: stop` — its ticket returns to the rail, without failure |
