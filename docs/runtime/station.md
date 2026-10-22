## The station

A **station** comes to take the tickets: a place where an engine runs, `<machine>/<engine>` —
`box/claude` is this machine, the `claude` binary, the Max connection of the service's account. For
each ticket: it takes it, creates a **worktree** on a new branch `cook/<run>` cut from the
integration branch, makes it executable, launches the cook there under guardrails, then
**harvests**. The repository's clone is never modified.

### Declaring the stations

**The runtime assumes no station: the project declares its own**, by the `station` gesture — a
decision of the chef, set in the project's log, read without a restart. It is not a fact of the
machine: the unit's drop-in carries nothing of it any more, and a `BRIGADE_STATIONS` variable left
lying there is **ignored** (the runtime says so at its start, with the gesture). One entry per
station, separated by commas; three fields per station, separated by `:`:

```
<machine>/<engine>:<cooks cap>:<capability>+<capability>[:distante[+ordinaires|+ensemble]],…
```

```bash
brigade <project> station stations box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless
```

The words `distante`, `ordinaires` and `ensemble` are what the runtime reads, so they stay French in the
declaration, as do the capability names you choose (`raisonnement`, `navigateur-headless`…): the
runtime recognizes none, it compares them as they are written.

| Field | What it says | What is accepted |
|---|---|---|
| **name** | `<machine>/<engine>`: the name by which the rail, the log, `status` and `station` designate it | a machine and an engine, each in lower case, digits and hyphens; **a name is declared only once** |
| **cap** | how many cooks it runs at once, **at most**: a station of this machine runs only what the machine's cores allow, if they allow fewer (see "Several cooks at once") | an integer greater than zero |
| **provides** | its **capabilities**: what this machine knows how to do (`code`, `navigateur-headless`, `chrome-connecté`…) | at least one; letters, digits and hyphens, separated by `+` |
| **distante** | optional: the station **does not run on the runtime's machine** — it is the chef's workstation. The runtime launches nothing there and never reaches it: it comes to pull its work itself (see "A remote station pulls its work") | the word `distante`, and nothing else: **no host, no port, no address** — the box does not know where it is |
| **ordinaires** | optional, after `distante` (`distante+ordinaires`): the remote station takes **the ordinary tickets too** — those that ask for no capability —, each one in the Claude Code sandbox of its workstation (see "Ordinary tickets on the chef's workstation" in [`station-distante.md`](station-distante.md)) | the word `ordinaires`, and only on a `distante` station: a station of the box already takes them |
| **ensemble** | optional, after `distante`, instead of `ordinaires` (`distante+ensemble`): the remote station is **one more station of the project**, which cooks **alongside** the first one rather than behind it — it takes the ordinary tickets like `ordinaires`, in the same sandbox, but as soon as it has room, without waiting for the box to be saturated (see "A second station of the project" in [`station-distante.md`](station-distante.md)) | the word `ensemble`, and only on a `distante` station; not with `ordinaires` |

- **Several stations on the same machine** are declared side by side (`box/claude`,
  `box/playwright`): each has its cap and its cooks, and a ticket goes to the first one, in the order
  of the declaration, that nothing withholds and that provides what it asks. All those that the
  project declares without the word `distante` run on this machine, through the same `claude` and
  the same Max connection: **the entry, the machine, the quota, the connection and the arbiter are
  common to them** — an exhausted quota or a dropped connection are said of all of them.
- **No station** (nothing set, or an empty declaration): this is accepted, the runtime starts — and
  **no cook leaves**. The tickets stay queued; the manager judges and the pass reads as always. The
  runtime says so at start (`brigade : stations — none …`), writes it (`stations.undeclared`), and
  `status` shows it as long as it lasts (`stations  NONE DECLARED…`, and `no station declared` on
  each waiting ticket); `installation` counts it as a **gap**. The gesture: `station stations
  <declaration>` — read at the next wake-up, with no restart.
- **Badly written, the declaration makes the start refuse**, and the refusal names the station and
  the field at fault — `BRIGADE_STATIONS invalid: station no. 2 (“box/claude:0:code”) — cap: “0” is
  not an integer greater than zero. Expected …`. A cap is not guessed, and a station does not
  disappear on a typo.
- **A station removed from the declaration** leaves `status` and `station` at restart
  (`station.withdrawn`); the ticket it held returns to queued, and the cooks it launched stay in the
  log and in the report.
- **A capability is not a permission.** It says what a machine *can do*; what is *allowed* remains
  the business of the grants. The runtime recognizes no capability name: it reads them, announces
  them, shows them, and compares them to what a ticket's card asks — a ticket leaves only in a
  station that provides what it asks (see "The capabilities a ticket asks for").

At start, the runtime says what it has read: `brigade : stations — box/claude (30 cooks at most;
provides: code, raisonnement) ; box/playwright (2 cooks at most; provides: navigateur-headless)` —
the declared cap; the one that holds, cores included, reads in `run status`. (The `brigade :` prefix
of the runtime's startup lines is written with the French spacing.)

### Several cooks at once

A station takes tickets as long as **three bounds** allow it, read again at each take:

| Bound | What it holds back | Setting |
|---|---|---|
| **The cooks cap** | the number of tickets the station holds at the same time | by default, that of the **machine's cores**, bounded by the one it declares (`station stations`); live: `run station -- cooks <N>`, for **all** the project's stations, `0` for no limit, `auto` to return to the default |
| **The entry** | the number of tickets whose worktree is being prepared and whose setup is playing | `BRIGADE_MAX_SETUPS`, **4** by default |
| **The machine** | no more takes when processor, memory or disk run short | three thresholds, below |

**The default cap comes from the cores.** Each station of this machine announces its machine's
cores (`cores` in `station.announced`), and runs only **`max(1, ⌊(cores − 2) / 2⌋)`** cooks: two
cores kept for the runtime, the pass and its gates, then about two per cook — its `claude`, its
tests, its setup —, so that the load stays under the number of cores. One core or two: 1 cook;
**8 cores: 3**; 12: 5; 16: 7. The declared cap is now only a bound: `box/claude:30` on 8 cores runs
3 cooks, `box/playwright:2` runs 2. A **remote** station keeps its declared cap: the box does not
see the cores of the workstation that carries it. Measured on an 8-core box under the old fixed cap
of 30: the load rose from 16 to 34, and the gates went from ~250 s to 364-438 s (#1045).

`run status` and `run station` say the cap and **where it comes from**:

| What gives it | What is shown |
|---|---|
| the cores | `box/claude: 3 at most — 8 cores` |
| the declaration, lower — or the cores unknown | `box/playwright: 2 at most — declared` |
| your setting, and what it replaces | `box/claude: 5 at most — set by you, replaces 3 (8 cores)` ; `no limit — set by you, replaces 3 (8 cores)` |

`cooks <N>` writes `station.capped` for each station, read within the second, kept after a restart —
**it wins over the default cap**, cores and declaration, and stays until another `cooks <N>`
replaces it. **`cooks auto` removes it** (`station.capped` with `maxCooks: null`): each station
returns to its default, the cores'. A ticket beyond the cap does not leave on top: it goes to
another station that has room, or waits its turn (`station.held`, reason `cap`). The entry and the
machine are common to the project's stations. **Lowering the cap stops no cook.** It counts only
the tickets' cooks — no judgement or review —, and a ticket returned or removed until its cook has
stopped. A ticket that waits for the entry stays queued, its lease does not run.

| Resource | It withholds when | Variable | Default |
|---|---|---|---|
| processor | the one-minute load average, per core, exceeds this threshold | `BRIGADE_MAX_LOAD_PER_CORE` | `1.5` |
| memory | less than this number of MB of **available** memory remains | `BRIGADE_MIN_FREE_MEMORY_MB` | a tenth of the total memory, `1024` at least |
| disk | less than this number of free MB remains on the disk of `BRIGADE_STATE_DIR` | `BRIGADE_MIN_FREE_DISK_MB` | `5120` |

**The memory guard** (#1080). Without `BRIGADE_MIN_FREE_MEMORY_MB`, its minimum derives from the
machine's total memory — the service's cgroup's if it has less: a tenth, one GB at least — `3277`
MB on 32 GB, `1638` on 16, `1024` on 8 and less. Available memory (`MemAvailable` on Linux) is what
the kernel can still give back: its out-of-memory killer acts only once nearly everything is taken.
The station stops taking well before, and what remains holds `sshd`, the runtime that keeps
publishing its state — `run status` reads throughout the withholding —, and the running cooks while
they grow. It is the outage of 20 October 2026 that it avoids: 32 GB, 512 MB of swap, processes
killed by the kernel and the box without `ssh` for four hours. A value in
`BRIGADE_MIN_FREE_MEMORY_MB` wins, like the other guardrails: read at the runtime's start, `0` to
never withhold.

Saturated, it says so: `station.saturated` then `station.relieved`, `MACHINE SATURATED` in `run
status` (`MACHINE SATURÉE` before #940) and `run station`. The fact names the first resource at
fault and, in `also`, the others; it is rewritten when one is added or lifts, not when a value
moves. `run status` names each resource at fault — memory, processor, both —, with what it has, its
threshold, and where the memory's comes from:

```
MACHINE SATURATED for 3 min on CPU and memory — load of 18.4 for at most 12 · 812 MB of memory available for at least 3,205 MB (default: 10% of the machine's 32,050 MB): box/claude takes no more tickets as long as it lasts
MACHINE SATURATED for 1 min on memory — 812 MB of memory available for at least 2,000 MB (set by BRIGADE_MIN_FREE_MEMORY_MB): box/claude takes no more tickets as long as it lasts
```

**The running cooks continue**, and the station resumes by itself when the machine breathes. The
saturation lifts with ten percent of margin, resource by resource; `0` for memory or disk: never
withheld. **A full rail does not leave in one block**: during its first minute, each cook launched
— and each ticket in the entry — weighs in advance one unit of load and 512 MB. The gates that the
pass plays load the machine too.

**A ticket that could leave and does not says why**: `station.held` in the log, a `WITHHOLDING`
line in `run status` (`SE RETIENT` before #940; `withholding` in `run station`), and the reason on
the ticket's line (`withheld by <station> (…)`).

| `reason` | What withholds the station |
|---|---|
| `ramp`, `machine` | the gradual ramp-up (the cooks just gone weigh in advance); the machine saturated |
| `cap`, `setups` | the cooks cap, the setups cap reached |
| `stopped`, `breaker` | your "stop", the breaker open |
| `station-stopped` | you stopped the project's kitchen on this station alone (see "Starting and stopping the kitchen, station by station") |
| `deploy` | a requested rollout — now read only in logs from before the station, which no longer asks for a rollout |
| `base` | the integration branch is red (see "The base is judged alone" in [`pass.md`](pass.md)) |
| `setup` | the project's setup is blocked: it failed twice in a row identically (see "The worktree setup comes before the cook") |
| `quota`, `disconnected` | the quota exhausted, the Max connection expired |
| `arbiter`, `unarbitrated` | the arbiter keeps the place for another project; it is unreachable: one cook at a time (see "The arbiter between projects") |

The fact is written when the reason changes, never when no ticket waits; `station.released` when
nothing withholds any more. **Two tickets whose zones overlap never leave together.** **A cook that
falls does not take the others with it**; a ticket returned while its cook runs is taken up again
only once that cook has stopped, and its zone stays held until then. Limits: a ticket that fails in
a loop accumulates **local branches** in the clone; **no quota gauge** (#63) — raise the cap in
steps.

### Starting and stopping the kitchen, station by station

*Ticket #1183.* The guardrails' "stop" stops the whole kitchen and cuts its cooks within the second.
To remove the project from **one** station without cutting anything — your Mac that has to serve
something else, a remote station to free —, the gesture is per station, the same for a station of
this machine and for a remote one, with nothing to type elsewhere:

```bash
brigade <project> station stop mac/claude     # it takes no more ticket of the project
brigade <project> station start mac/claude    # it resumes
```

- **Stopping is a soft stop.** The station takes nothing more (`station.held`, reason
  `station-stopped`; a remote one that claims receives `mission: null, held: "station-stopped"`).
  **Its running cooks are not touched**: a cook of this machine finishes, a remote one keeps
  renewing its lease and returns as before. What it delivers goes to the pass; if it delivers
  nothing, its ticket returns to the rail, as always — nothing is lost. The stopped station does
  not take it up again: another station that can cook it takes it, otherwise it waits for the
  station to be started again.
- **A stopped station of the box has no room**: when all the box's stations are stopped or
  saturated, a remote station that takes the ordinary tickets receives them (see "Ordinary tickets on the
  chef's workstation" in [`station-distante.md`](station-distante.md)).
- **The stop holds** after a restart, and even if the station is removed then declared again, until
  `start`. In the log: `station.stopped` and `station.started`, in the name of the `chef`.
- The gesture says what it did and how many cooks are finishing; repeated, it rewrites nothing
  (`already stopped`, `already cooking`); a station the project does not declare is refused (code 1)
  naming its own. `run station` shows it on the `cooking` line of each station.

**What each station does with the project** reads in `facts`, field `stations` (see "Facts, for a
program" in [`etat-et-mesures.md`](etat-et-mesures.md)): `cuisson` is `refused` (the machine's station refuses the project, `refus` says
why — of a station of this machine only), `stopped` (your stop of this station, `arreteeDepuis`; or
your "stop" of the whole kitchen, `arreteeDepuis` null), `saturated` (its machine can take no more —
of a station of this machine only) or `cooking`, in that order; `cooks` carries its running cooks —
stopped, those that are finishing —, each with the name of its station. The names of these fields
(`cuisson`, `refus`, `arreteeDepuis`) are still French in `facts`.

### The worktree setup comes before the cook

If the project has a `.claude/brigade/worktree-setup.sh` on the cook's branch, the station plays it
before the cook — `worktree-setup.sh <ticket number> <worktree>` — and **what it exports enters the
cook's environment**. The pass does the same before the gates.

| Case | What the station does |
|---|---|
| The project has no setup | nothing: the cook leaves |
| The setup succeeds | the cook leaves with its exports, and the lease starts again from zero |
| The setup fails, or exceeds **half the lease** | **no cook**: 86 for ten minutes, reason `setup-failed`, then back to queued. The breaker counts nothing |
| The setup fails **like the project's previous one** — same reason, no more host refused —, on this ticket or another | **the project is blocked** (`setup.blocked`): no setup is launched any more, for any ticket, as long as the integration branch has not moved |
| A ticket sent back by the pass | the setup is played in the send-back's new worktree |
| The repository declares a secret that the machine cannot give | **neither setup nor cook**: 86 for ten minutes, reason `secrets-unavailable`; the issue says which, once (see "The project's secrets" in [`identites-et-secrets.md`](identites-et-secrets.md)) |
| Under one identity per role, the ticket cannot be read on GitHub | **no cook**: 86 for ten minutes, reason `ticket-unreadable` (see "One GitHub identity per role" in [`identites-et-secrets.md`](identites-et-secrets.md)) |

**A failing setup reads on the issue**: exit code or cap exceeded, the end of its output (project
secrets and the shape of Claude's credentials masked), the time of the return, and **the host that
the door refused** during this setup, with the gesture that opens it — a line in
`.claude/brigade/reseau`, merged into the integration branch (see "The allowlist" in
[`cloison-et-arbitre.md`](cloison-et-arbitre.md)). **Once per cause**: again if the reason changes,
if a host never named on this ticket is refused, or if a cook has left since. `run partition` shows
the latest refusals.

**A failure that repeats blocks the project, not the ticket.** Retrying every ten minutes, ticket by
ticket, would only say the same thing again: as soon as a setup fails like the project's previous
one — the same reason (`exit code 1`, cap exceeded), and no refused host that the previous one did
not name —, the station writes `setup.blocked` with the cause and the integration-branch commit the
worktree started from, says so on the issue and in journald, and launches no setup any more: its
stations withhold (`setup`), the 86 tickets return to queued at their time and stay there. A setup
that passes between two failures resets the count; a failure of another cause follows the ordinary
course. **The resumption is on its own**: what lifts the cause — a host declared in
`.claude/brigade/reseau`, a fixed setup, a repaired dependency — arrives by being merged into the
integration branch. As long as the project is blocked, the station brings it in at each tick; as
soon as it has moved, `setup.unblocked`, the tickets 86 for a failing setup return to queued without
waiting for their time, and the setups start again. If the cause is not lifted, the first identical
failure blocks again at once, on the new base: one setup per merge, not one every ten minutes. A
passing failure (a registry down) blocks like any other: it lifts at the first merge into the
integration branch. The block holds after a restart.

**The same mechanism applies to every cause of setting aside that is not the ticket's.** A worktree
that does not prepare (`worktree-failed`), a ticket unreadable on GitHub (`ticket-unreadable`),
secrets unavailable (`secrets-unavailable`): the station writes `aside.failed` at each setting
aside; the same cause twice in a row on the project, with no cook gone in between, writes
`aside.blocked` (the cause, the base's commit) — a journald alert, and an `aside` entry in the
chef's queue, with the cause in plain words and the gesture. These causes lift outside the
repository (a value set, GitHub back): the block therefore does not stop the kitchen, it puts it
**at one ticket at a time** — the tickets return at their time, a single one probes. **The
resumption is on its own**: as soon as a cook leaves, the cause is lifted and the entry falls; if
another cause shows up, `aside.unblocked` (`why: cause`) and that one is counted; if the
integration branch moves, `aside.unblocked` (`why: base`) and the tickets 86 for that cause return
without waiting. The setup keeps its own block, above, unchanged.

**A worktree that does not prepare is told to the project, not only to journald** (*ticket #1118*).
Its `ticket.86` carries the reason in git's words (`why`) and, if the station cannot fetch the
repository or push to it, the denied access and its gesture (`access`: `blocked`, `reason`,
`gesture` — the check of `projets/acces.ts`, made after the failure, under the environment of its
fetches). As long as a failure holds, **each try first checks the access again**: denied, it fails
at once, fetching nothing, and pushes the time of the next one back by ten minutes; the gesture
done (`gh auth setup-git`, for example), the next try prepares its worktree in the same process,
with no restart, and `worktree.prepared` closes the failure. The station publishes the failure in
progress in the project's follow-up (`worktree`, see [`station-machine.md`](station-machine.md)),
until that try.

**The block enters your queue.** As long as it holds, the `awaiting` block carries a `setup` entry,
a single one for the project whatever the number of tickets held, with the cause in plain words and
the gesture: ``setup impossible: the door refuses `cdn.sheetjs.com` (…) — to declare in the
project's `.claude/brigade/reseau`, one line per host, then merge into the integration branch``;
without a refused host, the setup itself is to be fixed, and the entry names the issue where to read
what it said. The `setup` line at the top of `status` says it again, and the kitchen is `held` for
the app — unless a remote station, which prepares its setup on its workstation, can still cook. At
`setup.unblocked`, the entry and the line disappear by themselves. See "What awaits the chef" in
[`etat-et-mesures.md`](etat-et-mesures.md).

When writing the script: **the runtime's `BRIGADE_*` variables do not reach it**, nor the cook;
what it exports does — except `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and
`CLAUDE_CODE_OAUTH_TOKEN`, which the station removes. **The secrets the repository declares reach
it**, masked in what it says. **It leaves nothing running** in the background.

### The cook's gates reach the log

The cook plays the gates in its own shell; the runtime does not play them for it. So that what they
said reaches the log, **the station gives it a launcher** (`runtime/src/gates-du-cook.ts`):
`<clone>/.git/brigade/gates-du-cook`, written before each local cook of a project that has gates —
the partition gives the clone's `.git` to the cook, writable — and named in its instructions (first
cook, continuation, send-back, resumed session): « Les gates du dépôt, joue-les par
`<launcher> <ton worktree>` plutôt que par leur script… ». The launcher plays
`.claude/brigade/gates.sh <worktree>` as is — its output and its exit code are the script's — and
leaves a **receipt** in the worktree's own git directory (`brigade-gates.recus`), which nothing
commits and which leaves with the worktree: the tree it judged, read in a separate index before the
gates leave — uncommitted work included, the cook's index untouched —, the exit code, the wall-clock
time and the CPU of the script and what it waited for (`times`).

**At the end of the cook**, before its delivery goes to the pass, the station writes one `gates.ran`
per receipt — `runner: cook`, `green` for exit code 0 and `red` otherwise, with its `tree` and the
`config` read in the worktree as the cook leaves it — and erases the receipts. The pass reuses the
latest green one if it judged exactly that tree: see "The same gates are not played twice on the
same code" in [`pass.md`](pass.md). A cook that plays the script without the launcher, a remote
station's cook, an unreadable receipt: nothing reaches the log, and the pass plays its gates.

### Calibrating a ticket

**No cook leaves without a calibration**, set on the issue by two labels — by the manager if it is
on, by hand otherwise. No default value. `model:` is `opus`, `sonnet` or `haiku`; `effort:` is
`low`, `medium`, `high`, `xhigh` or `max`. Without one of the two, with two for the same dimension
or a value outside the list, the ticket is **refused**: 86, reason `no-calibration`, a comment says
what is missing. Once the labels are set, it returns to queued by itself, at the next poll.

### A ticket's card

**The tickets it awaits**, **the file zone it owns** and **the capabilities it asks of its
station** live in **a comment of its issue**, spotted by a marker:

```
<!-- brigade:fiche -->
**Fiche du ticket** — lue par le runtime, corrigeable à la main.
- attend : #68, #69
- zone : runtime/src/rail.ts, runtime/test/rail.test.ts
- requiert : navigateur-headless
```

The marker `<!-- brigade:fiche -->` and the keys `attend`, `zone` and `requiert` are what the
runtime still reads in the card, so they stay French (the heading line is free prose, which the
manager writes in French today). `attend` (*awaiting*): `#N`s, separated by commas or spaces.
`zone`: paths relative to the repository root — files or directories —, separated by commas.
`requiert` (*requires*): capability names, separated by commas or spaces — the line is
**optional**, and a card without it reads exactly as before (see "The capabilities a ticket asks
for"). Without a card, a ticket awaits no one, owns nothing and asks for nothing. **It is corrected
by hand**, by editing the comment; the reading tolerates case, bold, the bullet or its absence, the
order, and prose around. The marker **counts only at the head of a line, outside a code block**.
The manager writes the card of the tickets it splits.

| What the issue carries | What the runtime does with it |
|---|---|
| An unknown key (`budget : 40`); a bullet that is not `key : value`; a key set twice | unreadable card |
| A value that is not a `#N`, not a path of the repository (absolute, `~`, `..`), or not a capability name (`chrome/connecté`) | unreadable card — the value is quoted |
| A **pattern** in the zone (`*`, `?`) | unreadable card: a directory already owns everything it contains |
| Two cards | unreadable card, **neither is read** |
| A `#N` that designates no issue, the ticket itself, or a PR | unreadable card |
| `attend` entries that form a cycle between tickets of the rail | unreadable card for each ticket of the cycle |
| A card set by someone who has no hand on the repository | **ignored**, and said in journald (`fiche ignorée sur le ticket #N` — a message the runtime still writes in French) |

Unreadable card, the ticket is **refused** at the take: 86, reason `unreadable-card`, a comment lists
what must be corrected. Readable or removed, it returns by itself (`ticket.released`, reason
`card-readable`); what remains to be corrected reads in `run rail`. The card is read again when the
issue changes, and enters the log (`ticket.arrived`, `ticket.changed`, field `card`).

### The capabilities a ticket asks for

**A station provides capabilities** (the `stations` decision, see "Declaring the stations"); **a
ticket asks for some** by the `requiert` line of its card. The manager sets it at the split, for a
ticket that cannot be done without it — it reads what the project's stations provide —; it is
corrected by hand like the rest. Most tickets ask for none.

| What the ticket asks for | Where it goes |
|---|---|
| Nothing | to the first station, in the order of the declaration, that nothing withholds — **whatever it provides** |
| One or more capabilities | to the first free station that provides them **all**; what it provides in addition does not rule it out |
| A capability that a **full or withheld** station provides | nowhere for now: it waits for its place, no other takes it, and `status` says which one holds it |
| A capability that **no declared station provides** — or several that none provides together | **it does not leave**: 86, no cook |

- **Only the capability chooses the station, never a preference.** A specialty (security, writing,
  database) is not a capability: nothing in the runtime rules a station out because a ticket "would
  fit better" elsewhere.
- **Names are compared as they are** (`chrome-connecté` is not `chrome-connecte`): the runtime
  recognizes none. Only the way of writing an accent is indifferent.
- **Without a station that provides it, the ticket is 86 before any take** — written by the
  runtime, reason `no-station: chrome-connecté` (`no-station: a + b` when each is provided
  somewhere, never together), with no return time. **No cook is launched**, no worktree prepared;
  the other tickets leave, and it does not hold its zone. Its issue receives a comment that names
  what is missing and the declared stations.
- **The manager takes it up before the chef** (manager on). It rewrites or re-splits the ticket so
  that it no longer needs the capability: `manager.capability-resplit` in the log, the ticket
  leaves the rail (86 `manager:split`), its sub-tickets are born like an epic's, and nothing
  arrives in TODO. A ticket born from such a rewrite is not rewritten twice. If the rewrite is
  impossible, the manager sets a `gesture` card (`manager.capability-gestured`) that names the
  access to give and why the ticket cannot do without it; the ticket stays 86, and the card leaves
  TODO as soon as it is no longer in this case. Manager off, nothing takes it up: the block below
  shows it as it is.
- **`status` says what is missing and the gesture that would provide it**, in the `awaiting` block
  (manager off):

  ```
  #14  for 3 min  no station provides `chrome-connecté` — to provide: declare a station that provides it with `brigade <project> station stations <machine>/<engine>:<cook cap>:chrome-connecté`, or remove `chrome-connecté` from the `requiert` line of its card — it starts again on its own
  ```

- **It returns to queued by itself** (`ticket.released`, reason `capabilities-reread`): at restart,
  if a declared station now provides what it asks; at the poll, if its card no longer asks for it.
  A card that now asks for something else that is missing sends it back 86, under the new reason.
- **With no declared station at all**, a ticket that asks for a capability is 86 in the same way;
  one that asks for none waits, as before.
- **Asking for a capability authorizes nothing.** It says in which station the ticket leaves; what
  its cook is allowed to do does not change. `accès-prod` written on a `requiert` line is a name
  like any other: the list of what no grant authorizes (`runtime/src/grant.ts`) stays what it was,
  and `grant -- enable acces-prod` is refused as before.
