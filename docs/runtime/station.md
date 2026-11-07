## The station

A **station** comes to take the tickets: a place where an engine runs, `<machine>/<engine>` —
`box/claude` is this machine, the `claude` binary, the Max connection of the service's account. For
each ticket it takes it, creates a **worktree** on a new branch `cook/<run>` cut from the integration
branch, makes it executable, launches the cook there under guardrails, then **harvests**. The
repository's clone is never modified.

### Declaring the stations

**The runtime assumes no station: the project declares its own**, by the `station` gesture — a
decision of the chef, set in the project's log, read without a restart. A `BRIGADE_STATIONS` variable
left in the unit is **ignored** (the runtime says so at its start, with the gesture). One entry per
station, separated by commas; three fields per station, separated by `:`:

```
<machine>/<engine>:<cooks cap>:<capability>+<capability>[:distante[+ordinaires|+ensemble]],…
```

```bash
brigade <project> station stations box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless
```

The words `distante`, `ordinaires` and `ensemble` stay French in the declaration, as do the
capability names you choose (`raisonnement`, `navigateur-headless`…): the runtime recognizes none, it
compares them as written.

| Field | What it says | What is accepted |
|---|---|---|
| **name** | `<machine>/<engine>`: how the rail, the log, `status` and `station` designate it | a machine and an engine, each in lower case, digits and hyphens; **declared only once** |
| **cap** | how many cooks it runs at once, **at most** (a station of this machine runs only what the cores allow, if fewer: see "Several cooks at once") | an integer greater than zero |
| **provides** | its **capabilities**: what this machine knows how to do (`code`, `navigateur-headless`, `chrome-connecté`…) | at least one; letters, digits and hyphens, separated by `+` |
| **distante** | optional: the station is the chef's workstation, **not on the runtime's machine**. The runtime never reaches it: it pulls its work itself (see "A remote station pulls its work" in [`station-distante.md`](station-distante.md)) | the word `distante` only: **no host, port or address** |
| **ordinaires** | optional, after `distante`: the remote station takes **the ordinary tickets too** (those that ask for no capability), in the sandbox of its workstation (see "Ordinary tickets on the chef's workstation" in [`station-distante.md`](station-distante.md)) | only on a `distante` station |
| **ensemble** | optional, after `distante`, instead of `ordinaires`: the remote station is **one more station of the project**, cooking **alongside** the first (see "A station on another machine" in [`station-distante.md`](station-distante.md)) | only on a `distante` station; not with `ordinaires` |

- **Several stations on the same machine** are declared side by side (`box/claude`,
  `box/playwright`): each has its cap and cooks, and a ticket goes to the first one, in declaration
  order, that nothing withholds and that provides what it asks. Those without `distante` run on this
  machine through the same `claude` and Max connection: **the entry, the machine, the quota, the
  connection and the arbiter are common to them**.
- **No station** (nothing set, or an empty declaration) is accepted, and **no cook leaves**: tickets
  stay queued; the manager judges and the pass reads as always. The runtime says so at start
  (`brigade : stations — none …`), writes `stations.undeclared`, and `status` shows it (`stations
  NONE DECLARED…`, and `no station declared` on each waiting ticket); `installation` counts a
  **gap**. The gesture is `station stations <declaration>`, read at the next wake-up.
- **Badly written, the declaration makes the start refuse**, naming the station and the field at
  fault (`BRIGADE_STATIONS invalid: station no. 2 (“box/claude:0:code”) — cap: “0” is not an integer
  greater than zero. Expected …`). A cap is not guessed.
- **A station removed from the declaration** leaves `status` and `station` at restart
  (`station.withdrawn`); its ticket returns to queued, and its cooks stay in the log and the report.
- **A capability is not a permission.** It says what a machine *can do*; what is *allowed* remains the
  business of the grants. The runtime only reads, announces, shows and compares capabilities to what a
  ticket's card asks (see "The capabilities a ticket asks for").

At start the runtime says what it has read: `brigade : stations — box/claude (30 cooks at most;
provides: code, raisonnement) ; box/playwright (2 cooks at most; provides: navigateur-headless)` —
the declared cap; the one that holds, cores included, reads in `run status`.

### Several cooks at once

A station takes tickets as long as **three bounds** allow it, read again at each take:

| Bound | What it holds back | Setting |
|---|---|---|
| **The cooks cap** | the tickets the station holds at once | by default the **machine's cores**, bounded by the declared cap; live: `run station -- cooks <N>` for **all** the project's stations, `0` for no limit, `auto` for the default |
| **The entry** | the tickets whose worktree is being prepared and whose setup is playing | `BRIGADE_MAX_SETUPS`, **4** by default |
| **The machine** | no more takes when processor, memory or disk run short | three thresholds, below |

**The default cap comes from the cores.** Each station of this machine announces its machine's cores
(`cores` in `station.announced`) and runs only **`max(1, ⌊(cores − 2) / 2⌋)`** cooks: two cores kept
for the runtime, the pass and its gates, then about two per cook. One or two cores: 1 cook; **8: 3**;
12: 5; 16: 7. The declared cap is only a bound (`box/claude:30` on 8 cores runs 3). A **remote**
station keeps its declared cap: the box does not see its cores (#1045).

`run status` and `run station` say the cap and **where it comes from**:

| What gives it | What is shown |
|---|---|
| the cores | `box/claude: 3 at most — 8 cores` |
| the declaration, lower — or the cores unknown | `box/playwright: 2 at most — declared` |
| your setting, and what it replaces | `box/claude: 5 at most — set by you, replaces 3 (8 cores)` ; `no limit — set by you, replaces 3 (8 cores)` |

`cooks <N>` writes `station.capped` for each station, read within the second, kept after a restart —
**it wins over the default cap** until another `cooks <N>`. **`cooks auto` removes it**
(`station.capped` with `maxCooks: null`). A ticket beyond the cap goes to another station that has
room, or waits (`station.held`, reason `cap`). The entry and the machine are common to the project's
stations. **Lowering the cap stops no cook.** It counts only tickets' cooks — no judgement or review
—, and a ticket returned or removed until its cook has stopped. A ticket that waits for the entry
stays queued, its lease does not run.

| Resource | It withholds when | Variable | Default |
|---|---|---|---|
| processor | the one-minute load average, per core, exceeds this | `BRIGADE_MAX_LOAD_PER_CORE` | `1.5` |
| memory | less than this many MB of **available** memory remains | `BRIGADE_MIN_FREE_MEMORY_MB` | a tenth of the total memory, `1024` at least |
| disk | less than this many free MB on the disk of `BRIGADE_STATE_DIR` | `BRIGADE_MIN_FREE_DISK_MB` | `5120` |

**The memory guard** (#1080). Its default minimum is a tenth of the machine's total memory (the
service's cgroup's if smaller), one GB at least: `3277` MB on 32 GB, `1638` on 16, `1024` on 8 and
less. Available memory (`MemAvailable` on Linux) is what the kernel can still give back; the station
stops taking well before the out-of-memory killer acts. `BRIGADE_MIN_FREE_MEMORY_MB` wins, read at the
runtime's start; `0` for memory or disk: never withheld.

Saturated, it says so: `station.saturated` then `station.relieved`, `MACHINE SATURATED` in `run
status` and `run station`. The fact names the first resource at fault and, in `also`, the others; it
is rewritten when one is added or lifts, not when a value moves. `run status` names each resource at
fault, with what it has, its threshold, and where the memory's comes from:

```
MACHINE SATURATED for 1 min on memory — 812 MB of memory available for at least 2,000 MB (set by BRIGADE_MIN_FREE_MEMORY_MB): box/claude takes no more tickets as long as it lasts
```

**The running cooks continue**, and the station resumes by itself when the machine breathes (ten
percent of margin, resource by resource). **A full rail does not leave in one block**: during its
first minute, each cook launched — and each ticket in the entry — weighs in advance one unit of load
and 512 MB. The gates the pass plays load the machine too.

**A ticket that could leave and does not says why**: `station.held` in the log, a `WITHHOLDING` line
in `run status` (`withholding` in `run station`), and the reason on the ticket's line (`withheld by
<station> (…)`).

| `reason` | What withholds the station |
|---|---|
| `ramp`, `machine` | the gradual ramp-up; the machine saturated |
| `cap`, `setups` | the cooks cap, the setups cap reached |
| `stopped`, `breaker` | your "stop", the breaker open |
| `station-stopped` | you stopped the kitchen on this station alone (see "Starting and stopping the kitchen, station by station") |
| `deploy` | a requested rollout — read only in logs from before the station |
| `base` | the integration branch is red (see "The base is judged alone" in [`pass.md`](pass.md)) |
| `setup` | the project's setup is blocked (see "The worktree setup comes before the cook") |
| `quota`, `disconnected` | the quota exhausted, the Max connection expired |
| `unstartable` | a cook of the station ended with 0 turns and 0 tokens: it could not start (see "A cook that cannot start" in [`station-cook.md`](station-cook.md)) |
| `arbiter`, `unarbitrated` | the arbiter keeps the place for another project; it is unreachable: one cook at a time (see "The arbiter between projects") |

The fact is written when the reason changes, never when no ticket waits; `station.released` when
nothing withholds any more. **Two tickets whose zones overlap never leave together.** **A cook that
falls does not take the others with it**; a ticket returned while its cook runs is taken up again
only once that cook has stopped, and its zone stays held until then. Limits: a ticket that fails in a
loop accumulates **local branches** in the clone; there is **no quota gauge** (#63).

### Starting and stopping the kitchen, station by station

*Ticket #1183.* The guardrails' "stop" stops the whole kitchen and cuts its cooks within the second.
To remove the project from **one** station without cutting anything, the gesture is per station, the
same for a station of this machine and a remote one:

```bash
brigade <project> station stop mac/claude     # it takes no more ticket of the project
brigade <project> station start mac/claude    # it resumes
```

- **Stopping is a soft stop.** The station takes nothing more (`station.held`, reason
  `station-stopped`; a remote one that claims receives `mission: null, held: "station-stopped"`).
  **Its running cooks are not touched**: they finish, and what they deliver goes to the pass; if
  nothing is delivered, the ticket returns to the rail and another station that can cook it takes it,
  otherwise it waits for `start`.
- **A stopped station of the box has no room** for the purpose of the remote station that takes
  ordinary tickets (see "Ordinary tickets on the chef's workstation" in
  [`station-distante.md`](station-distante.md)).
- **The stop holds** after a restart, even if the station is removed then declared again, until
  `start`. In the log: `station.stopped` and `station.started`, in the name of the `chef`.
- The gesture says what it did and how many cooks are finishing; repeated, it rewrites nothing
  (`already stopped`, `already cooking`); a station the project does not declare is refused (code 1).
  `run station` shows it on the `cooking` line of each station.

**What each station does with the project** reads in `facts`, field `stations` (see "Facts, for a
program" in [`etat-et-mesures.md`](etat-et-mesures.md)): `cuisson` is `refused` (the machine's station
refuses the project, `refus` says why — a station of this machine only), `stopped` (your stop of this
station, `arreteeDepuis`; or your "stop" of the whole kitchen, `arreteeDepuis` null), `saturated` (its
machine can take no more — a station of this machine only) or `cooking`, in that order; `cooks`
carries its running cooks, each with its station's name. These field names (`cuisson`, `refus`,
`arreteeDepuis`) are still French.

### A station on Windows

A Windows station serves a project like any other. What Windows does differently, the runtime handles:

- **Launching.** Windows launches only its executables. A shebang script (a `BRIGADE_CLAUDE_BIN` that
  names one, a test double) runs through its interpreter: `node` is the runtime's own, `bash` and `sh`
  are Git for Windows' (never WSL's). Git's bash does not read its command line the way Windows
  programs do: it expands an unquoted argument that holds `*`, `?`, `[`, `{` or `(` as a pattern, and
  a `[]` with no `]` after it (`labels[]=fire`) kills it before the script runs, with no message. So
  such an argument goes to it between single quotes, which it reads as they are. A `.cmd` or `.bat` runs through `cmd.exe`, every argument
  escaped; no window opens. A `.cmd` receives no argument that spans several lines, and the cook's
  prompt is one: `claude` must be named by its executable (`claude.exe`), not by an npm `.cmd`
  launcher, or the cook fails at launch and the `error` of its `cook.exited` says why
  (`runtime/src/sans-invite.ts`).
- **Line endings.** The station's `git` checks worktrees out in the repository's own line endings
  (`core.autocrlf=false`, `core.eol=lf`), since Git for Windows' default would break project scripts
  under bash. Only `eol=crlf` in `.gitattributes` decides otherwise. The cook's `git` receives no
  `GIT_CONFIG_*`: what it checks out itself follows the machine's configuration.
- **The log.** The paths it holds (`worktree` and `stream` of `cook.launched`) are written with `/`.
- **Not covered yet**: the worktree setup (its exports come back on a file descriptor beyond the first
  three, which Git's bash is not known to pass on). A project with a `worktree-setup.sh` is not proven
  served on Windows.

`runtime/test/cuisson-de-bout-en-bout.test.ts` proves the rest on every platform, the Windows CI job
included.

### The worktree setup comes before the cook

If the project has a `.claude/brigade/worktree-setup.sh` on the cook's branch, the station plays it
before the cook — `worktree-setup.sh <ticket number> <worktree>` — and **what it exports enters the
cook's environment**. The pass does the same before the gates.

**On the GitHub-only station, the only path since #2061** (*ticket #2535*, `runtime/src/brigade-github.ts`):
the station of the box plays the setup in the cook's fresh worktree, under the partition, before it
launches the cook — capped like the gates of a head (`BRIGADE_GATES_TIMEOUT_SECONDS`, 30 min by
default). The setup gets neither Claude's token nor a GitHub credential, and cannot hand one to the
cook; what else it exports enters the cook's environment. **A failing setup does not hold the cook**:
it leaves in its worktree as git laid it, and journald says which ticket and why. Until #2535 this
station launched every cook in a worktree with no dependencies: its first gates came out red
(`contrôle de types injouable`, `dépendances absentes`), and the cook played the setup, then the gates
again, in cooking time. The chef's workstation (`station-ordinateur`) does not play it: its cooks run
in Claude Code's sandbox, not under the partition. The table and the paragraphs below describe the old
path's station.

| Case | What the station does |
|---|---|
| The project has no setup | nothing: the cook leaves |
| The setup succeeds | the cook leaves with its exports, and the lease starts again from zero |
| The setup fails, or exceeds **half the lease** | **no cook**: 86 for ten minutes, reason `setup-failed`, then back to queued. The breaker counts nothing |
| The setup fails **like the project's previous one** — same reason, no more host refused —, on this ticket or another | **the project is blocked** (`setup.blocked`): no setup is launched for any ticket as long as the integration branch has not moved |
| A ticket sent back by the pass | the setup is played in the send-back's new worktree |
| The setup fails for **the preparation ticket**, while it holds the rail | **the cook leaves anyway**, without exports (below) |
| The repository declares a secret that the machine cannot give | **neither setup nor cook**: 86 for ten minutes, reason `secrets-unavailable`; the issue says which, once (see "The project's secrets" in [`identites-et-secrets.md`](identites-et-secrets.md)) |
| Under one identity per role, the ticket cannot be read on GitHub | **no cook**: 86 for ten minutes, reason `ticket-unreadable` (see "One GitHub identity per role" in [`identites-et-secrets.md`](identites-et-secrets.md)) |

**A failing setup reads on the issue**: exit code or cap exceeded, the end of its output (project
secrets and the shape of Claude's credentials masked), the time of the return, and **the host the
door refused** during this setup, with the gesture that opens it — a line in
`.claude/brigade/reseau`, merged into the integration branch (see "The allowlist" in
[`cloison-et-arbitre.md`](cloison-et-arbitre.md)). **Once per cause**: again if the reason changes, a
host never named on this ticket is refused, or a cook has left since. `run partition` shows the
latest refusals.

**The preparation ticket is not held by the setup it must fix** (*ticket #1392*). While it holds the
rail, a failing setup launches its cook anyway, with no exports and no `ticket.86` or `setup.failed`
(nothing counts towards a block). The station writes `preparation.setup-failed` with the failure **in
one sentence** (`runtime/src/preparation-depot/setup-en-echec.ts`): what the output names as missing
(a file, a command, a Docker daemon), otherwise the exit code and last line. That sentence goes to the
cook's instructions, to the ticket's body (between `<!-- brigade:setup-en-echec -->` markers, replaced
or removed as the cause changes) and to the project page ([`station-machine.md`](station-machine.md)).
A blocked setup does not withhold the stations meanwhile. Once served, the delivered setup is played
before every cook, and a failure launches none.

**A failure that repeats blocks the project, not the ticket.** When a setup fails like the project's
previous one (same reason, no new refused host), the station writes `setup.blocked` with the cause and
the base commit, says so on the issue and in journald, and launches no setup: its stations withhold
(`setup`), and the 86 tickets stay queued. A passing setup resets the count. **The resumption is on its
own**: what lifts the cause (a host in `.claude/brigade/reseau`, a fixed setup) arrives by merge into
the integration branch, which the station brings in at each tick. Once it has moved, `setup.unblocked`:
the tickets return to queued and the setups start again; if the cause remains, the first identical
failure blocks again on the new base. The block holds after a restart.

**The same mechanism applies to the other causes of setting aside that are not the ticket's**:
`worktree-failed`, `ticket-unreadable`, `secrets-unavailable`. The station writes `aside.failed` at
each one; the same cause twice in a row with no cook gone in between writes `aside.blocked` — a
journald alert and an `aside` entry in the chef's queue with the gesture. These causes lift outside the
repository, so the kitchen goes **to one ticket at a time** (a single one probes) rather than stopping.
As soon as a cook leaves, the cause is lifted; another cause gives `aside.unblocked` (`why: cause`) and
is counted; a moved base gives `aside.unblocked` (`why: base`) and the tickets return at once.

**A worktree that does not prepare is told to the project** (*ticket #1118*). Its `ticket.86` carries
git's reason (`why`) and, if the station cannot fetch or push, the denied access and its gesture
(`access`: `blocked`, `reason`, `gesture`). **Each try first checks the access again**: denied, it
fails at once and pushes the next try back ten minutes; once the gesture is done (`gh auth
setup-git`), the next try prepares its worktree with no restart and `worktree.prepared` closes the
failure. The failure in progress is published in the project's follow-up (`worktree`, see
[`station-machine.md`](station-machine.md)).

**The block enters your queue.** The `awaiting` block carries one `setup` entry with the cause and the
gesture (``setup impossible: the door refuses `cdn.sheetjs.com` (…) — to declare in the project's
`.claude/brigade/reseau`, one line per host, then merge into the integration branch``); without a
refused host, it names the issue to read. The `setup` line of `status` repeats it, and the kitchen is
`held` for the app — unless a remote station can still cook. Both disappear at `setup.unblocked`. See
"What awaits the chef" in [`etat-et-mesures.md`](etat-et-mesures.md).

When writing the script: **the runtime's `BRIGADE_*` variables do not reach it**, nor the cook; what it
exports does — except `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and `CLAUDE_CODE_OAUTH_TOKEN`,
which the station removes. **The secrets the repository declares reach it**, masked in what it says.
**It leaves nothing running** in the background.

### The cook's gates reach the log

The cook plays the gates in its own shell. So that what they said reaches the log, **the station gives
it a launcher** (`runtime/src/gates-du-cook.ts`): `<clone>/.git/brigade/gates-du-cook`, written before
each local cook of a project that has gates and named in its instructions (first cook, continuation,
send-back, resumed session): « Les gates du dépôt, joue-les par `<launcher> <ton worktree>` plutôt que
par leur script… ». The launcher plays `.claude/brigade/gates.sh <worktree>` as is (its output and exit
code are the script's) and leaves a **receipt** in the worktree's git directory (`brigade-gates.recus`),
which nothing commits: the tree it judged, read in a separate index before the gates leave
(uncommitted work included, the cook's index untouched), the exit code, the wall-clock time and the
CPU of the script and what it waited for (`times`).

**At the end of the cook**, the station writes one `gates.ran` per receipt (`runner: cook`, `green` or
`red`, with its `tree` and `config`) and erases the receipts. The pass reuses the latest green one if
it judges exactly that tree: see "The same gates are not played twice on the same code" in
[`pass.md`](pass.md). A script played without the launcher, a remote cook, an unreadable receipt:
nothing reaches the log, and the pass plays its gates.

### Calibrating a ticket

**No cook leaves without a calibration**, set on the issue by two labels — by the manager if it is on,
by hand otherwise. No default. `model:` is `opus`, `sonnet` or `haiku`; `effort:` is `low`, `medium`,
`high`, `xhigh` or `max`. With one missing, two for the same dimension, or a value outside the list,
the ticket is **refused**: 86, reason `no-calibration`, a comment says what is missing. Once the
labels are set, it returns to queued at the next poll.

### A ticket's card

**The tickets it awaits**, **the file zone it owns** and **the capabilities it asks of its station**
live in **a comment of its issue**, spotted by a marker:

```
<!-- brigade:fiche -->
**Fiche du ticket** — lue par le runtime, corrigeable à la main.
- attend : #68, #69
- zone : runtime/src/rail.ts, runtime/test/rail.test.ts
- requiert : navigateur-headless
```

The marker and the keys `attend`, `zone` and `requiert` are what the runtime reads, so they stay
French (the heading line is free prose). `attend` (*awaiting*): `#N`s, separated by commas or spaces.
`zone`: paths relative to the repository root — files or directories —, separated by commas.
`requiert` (*requires*): capability names, separated by commas or spaces; **optional** (see "The
capabilities a ticket asks for"). Without a card, a ticket awaits no one, owns nothing and asks for
nothing. **It is corrected by hand**, by editing the comment; the reading tolerates case, bold, the
bullet or its absence, the order, and prose around. The marker **counts only at the head of a line,
outside a code block**. The manager writes the card of the tickets it splits.

| What the issue carries | What the runtime does with it |
|---|---|
| An unknown key (`budget : 40`); a bullet that is not `key : value`; a key set twice | unreadable card |
| A value that is not a `#N`, not a path of the repository (absolute, `~`, `..`), or not a capability name (`chrome/connecté`) | unreadable card — the value is quoted |
| A **pattern** in the zone (`*`, `?`) | unreadable card: a directory already owns everything it contains |
| Two cards | unreadable card, **neither is read** |
| A `#N` that designates no issue, the ticket itself, or a PR | unreadable card |
| `attend` entries that form a cycle between tickets of the rail | unreadable card for each ticket of the cycle |
| A card set by someone who has no hand on the repository | **ignored**, and said in journald (`fiche ignorée sur le ticket #N`, still written in French) |

Unreadable card, the ticket is **refused** at the take: 86, reason `unreadable-card`, a comment lists
what must be corrected. Readable or removed, it returns by itself (`ticket.released`, reason
`card-readable`); what remains to be corrected reads in `run rail`. The card is read again when the
issue changes, and enters the log (`ticket.arrived`, `ticket.changed`, field `card`).

### A cook that stops without a delivery

The comment on the issue and the station journal both say why: the exit code and the last lines
`claude` wrote (its standard error, else its last message). A stop the cook did not cause does not
count as one of the 3 tries: Claude quota or usage limit, a lost Claude session, a GitHub limit, a
station stopped or a process killed. The ticket is given back with an `attente` marker on its issue
and is not taken again before it ends: 30 minutes, or the time the quota comes back when the stream
says it (6 hours at most). It is then retried, never set aside for it. **A cook that dies because
its own station stops waits for nothing** (#2543): the station is told it stops before the runtime
kills its cooks, says so on the issue ("the cook stopped with its station"), and gives the ticket back
with no `attente` marker; the restarted station, or another one, takes it at its next round. The box
restarts its station at each update, every 35 to 45 minutes while merges keep coming: with the
30-minute wait, a ticket taken again had 5 to 15 minutes before the next restart killed its cook once
more — #2502 four times, #2464 six. **And the box no longer kills its cooks to update** (#2547):
before installing, its updater posts its request (`vidange` in the update directory, with its
deadline, `echeance`); the station writes its cooks in flight (`en-vol` in its directory) and **keeps
taking tickets up to its places** (#2586 — it used to stop taking any, so the kitchen drained and
refilled). The restart comes at the first moment with no cook in flight or, failing that, at the
deadline (15 minutes by default, `BRIGADE_MISE_A_JOUR_VIDANGE_S`; the batching logic gives its own).
At the deadline, the station first saves the work of each cook in flight on its branch — committed
(`brigade: work in progress saved before the station restarts (#2586)`) and pushed — then says it is
ready (`prete` in `en-vol`), and takes no ticket until the restart. The ticket is given back; the next
cook resumes the saved branch, told so in its brief, and that head is never sent to the pass as a
delivery cut before its PR (#2577). A station that never says it is ready has its cooks cut 30 s
after the deadline, as before. **The computer's station waits the same way** (#2815,
`runtime/src/station-update/`): a ready release no longer stops its claims until its last cook ends —
it keeps taking tickets and restarts at the first moment with no cook in flight or, at the latest, an
hour later, its cooks' work saved; drained at nearly every release, it made claim wait the whole lost
time of BOBL-tech/mirrorscreen's tickets. After a send back, "added
nothing since its last delivery" is a failed cook only if the cook ran past its first 3 turns;
stopping earlier means it never worked on the review's remarks, and waits like a stop it did not
cause — but the third such stop in a row counts as a failed cook, so a cook that never works does
not loop for ever.

### Relaunching a set-aside ticket

A station on GitHub alone sets a ticket aside (`hors-cuisine`) after 3 cooks in a row without a delivery (or 2 in a row with the same stop reason, #2729), or
after 2 sends back of the same delivery. To relaunch it, fix the cause, then **remove `hors-cuisine`**
from the issue (anyone with a hand on the repository; `fire` stays). The ticket is served again at
the next turn, and both counts restart: the cooks without a delivery and the sends back are counted
from the removal, which every station reads on GitHub (the issue's label-removal event), so the next
set-aside needs the full number of failures again. The earlier `brigade:echec` and `brigade:renvoi`
comments stay on the issue as history. A delivery that was already good needs no `in-pass` by hand:
it is reviewed again once the ticket is served.

### The capabilities a ticket asks for

**A station provides capabilities** (see "Declaring the stations"); **a ticket asks for some** by the
`requiert` line of its card. The manager sets it at the split, for a ticket that cannot be done
without it (it reads what the project's stations provide); it is corrected by hand. Most tickets ask
for none.

| What the ticket asks for | Where it goes |
|---|---|
| Nothing | to the station, in declaration order, that nothing withholds — **whatever it provides** |
| One or more capabilities | to the first free station that provides them **all** |
| A capability that a **full or withheld** station provides | nowhere for now: it waits for its place, and `status` says which one holds it |
| A capability that **no declared station provides** — or several that none provides together | **it does not leave**: 86, no cook |

- **Only the capability chooses the station, never a preference.** A specialty (security, writing,
  database) is not a capability.
- **Names are compared as they are** (`chrome-connecté` is not `chrome-connecte`); only the way of
  writing an accent is indifferent.
- **Without a station that provides it, the ticket is 86 before any take**, reason `no-station:
  chrome-connecté` (`no-station: a + b` when each is provided somewhere, never together), with no
  return time, no cook, no worktree, and it holds no zone. Its issue receives a comment naming what is
  missing and the declared stations. It is no longer on the rail: `status`, `rail` and the app read it
  as WAITING (``a station that provides `<capability>` ``; `facts`: `rail[].tiers`, `relance` `null`),
  while it stays 86 in the log (#1925). Once a declared station provides it (read live), the next
  service puts it back on the rail (`ticket.released`, `capabilities-reread`). The tickets that wait for
  it come back with it, unless another WAITING ticket holds them (#1926).
- **The manager takes it up before the chef** (manager on). It rewrites or re-splits the ticket so
  that it no longer needs the capability (`manager.capability-resplit`; the ticket leaves the rail, 86
  `manager:split`; never rewritten twice). If impossible, it sets a `gesture` card
  (`manager.capability-gestured`) naming the access to give; the ticket stays 86. Manager off, nothing
  takes it up.
- **`status` says what is missing and the gesture**, in the `awaiting` block (manager off):

  ```
  #14  for 3 min  no station provides `chrome-connecté` — to provide: declare a station that provides it with `brigade <project> station stations <machine>/<engine>:<cook cap>:chrome-connecté`, or remove `chrome-connecté` from the `requiert` line of its card — it starts again on its own
  ```

- **It returns to queued by itself** (`ticket.released`, `capabilities-reread`): at restart, if a
  declared station now provides it; at the poll, if its card no longer asks for it.
- **The chef has two ways out** (#1958), on its WAITING card: give the capability to one of the
  project's stations (`installation stations set`), or make it a human's job (`rail human <ticket>`,
  [`journal-et-rail.md`](journal-et-rail.md), "Handing a ticket to a human"): it leaves the rail,
  `hors-cuisine`, and its task enters TODO.
- **With no declared station at all**, a ticket that asks for a capability is 86 in the same way; one
  that asks for none waits.
- **Asking for a capability authorizes nothing.** `accès-prod` on a `requiert` line is a name like any
  other: the list of what no grant authorizes (`runtime/src/grant.ts`) stays, and `grant -- enable
  acces-prod` is refused.

A ticket whose files all live under `.claude/brigade/` is never launched to a cook (#2729): a cook's session cannot write there. The station labels it `blocked-on-human` with a question for the second or the chef. Tickets the station opened itself (body starting with `<!-- brigade:`) are exempt.
