## The station

A **station** comes to take tickets: a place where an engine runs, `<machine>/<engine>` —
`box/claude` is this machine, the `claude` binary, the Max connection of the service's account. For
each ticket, it takes it, creates a **worktree** on a fresh branch `cook/<run>` cut from the
integration branch, makes it executable, runs the cook there under guardrails, then **harvests**. The
repo's clone is never modified.

### Declaring the stations

**The runtime assumes no station: the project declares its own**, through the `station` command
— a chef's decision, written to the project's log, read without restarting. It is not a fact of
the machine: the unit's drop-in no longer carries any of it, and a `BRIGADE_STATIONS` variable lying around there is
**ignored** (the runtime says so at startup, with the command). One station per entry,
separated by commas; three fields per station, separated by `:`:

```
<machine>/<engine>:<cook cap>:<capability>+<capability>[:distante[+ordinaires]],…
```

```bash
brigade <project> station stations box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless
```

| Field | What it says | What is accepted |
|---|---|---|
| **name** | `<machine>/<engine>`: the name by which the rail, the log, `status` and `station` designate it | a machine and an engine, each in lowercase letters, digits and hyphens; **a name is declared only once** |
| **cap** | how many cooks it runs at once, **at most**: a local station runs only what the machine's cores allow, if they allow fewer (see "Several cooks at once") | an integer greater than zero |
| **provides** | its **capabilities**: what this machine knows how to do (`code`, `navigateur-headless`, `chrome-connecté`…) | at least one; letters, digits and hyphens, separated by `+` |
| **distante** | optional: the station **does not run on the runtime's machine** — the chef's workstation. The runtime launches nothing there and never reaches it: it is the station that comes to pull its work (see "A remote station pulls its work") | the word `distante`, and nothing else: **no host, no port, no address** — the box does not know where it is |
| **ordinaires** | optional, after `distante` (`distante+ordinaires`): the remote station **also takes ordinary tickets** — those that ask for no capability —, each in the Claude Code sandbox of its workstation (see "Ordinary tickets on the chef's workstation") | the word `ordinaires`, and only on a `distante` station: a box station already takes them |

- **Several stations on the same machine** are declared side by side (`box/claude`, `box/playwright`):
  each has its cap and its cooks, and a ticket goes to the first one, in declaration
  order, that nothing holds back and that provides what it asks for. All those the project declares
  without the word `distante` run on this machine,
  through the same `claude` and the same Max connection: **the entry, the machine, the quota, the connection and
  the arbiter are common to them** — an exhausted quota or a dropped connection is told of all of them.
- **No station** (nothing set, or an empty declaration): it is accepted, the runtime starts —
  and **no cook leaves**. Tickets stay queued; the manager still judges and the pass still
  reviews. The runtime says so at startup (`brigade: stations — none…`), writes it
  (`stations.undeclared`), and `status` shows it as long as it lasts (`stations  NONE DECLARED…`,
  and `no station declared` on each queued ticket); `installation` counts it as a
  **gap**. The action: `station stations <declaration>` — read at the next wake-up, without restarting.
- **Badly written, the declaration makes the startup refuse**, and the refusal names the station and the field
  at fault — `BRIGADE_STATIONS invalid: station no. 2 ("box/claude:0:code") — cap: "0"
  is not an integer greater than zero`. A cap is not guessed, and a station does not disappear
  on a typo.
- **A station removed from the declaration** leaves `status` and `station` at restart
  (`station.withdrawn`); the ticket it held goes back to queued, and the cooks it launched
  stay in the log and in the record.
- **A capability is not a permission.** It says what a machine *can do*; what is
  *permitted* remains the business of grants. The runtime recognizes no capability name: it reads them,
  announces them, shows them, and compares them with what a ticket's card asks for — a ticket
  leaves only in a station that provides what it asks for (see "The capabilities a ticket asks for").

At startup, the runtime says what it read: `brigade: stations — box/claude (30 cooks at most;
provides: code, raisonnement); box/playwright (2 cooks at most; provides: navigateur-headless)` —
the declared cap; the one that holds, cores included, is read in `run status`.

### Several cooks at once

A station takes tickets as long as **three limits** allow, rechecked at each take:

| Limit | What it holds back | Setting |
|---|---|---|
| **The cook cap** | the number of tickets the station holds at the same time | by default, that of the **machine's cores**, bounded by the one it declares (`station stations`); live: `run station -- cooks <N>`, for **all** the project's stations, `0` for no limit, `auto` to return to the default |
| **The entry** | the number of tickets whose worktree is being prepared and whose setup is running | `BRIGADE_MAX_SETUPS`, **4** by default |
| **The machine** | no more takes when processor, memory or disk run short | three thresholds, below |

**The default cap comes from the cores.** Each local station announces its machine's cores
(`cores` in `station.announced`), and runs only **`max(1, ⌊(cores − 2) / 2⌋)`** cooks:
two cores kept for the runtime, the pass and its gates, then about two per cook — its `claude`,
its tests, its setup —, so that the load stays under the number of cores. One or two cores: 1 cook;
**8 cores: 3**; 12: 5; 16: 7. The declared cap is now only a bound: `box/claude:30` on
8 cores runs 3 cooks, `box/playwright:2` runs 2. A **remote** station keeps its
declared cap: the box does not see the cores of the workstation that carries it. Measured on an 8-core box
under the old fixed cap of 30: the load climbed from 16 to 34, and the gates went from ~250 s to
364-438 s (#1045).

`run status` and `run station` state the cap and **where it comes from**:

| What gives it | What is displayed |
|---|---|
| the cores | `box/claude: 3 at most — 8 cores` |
| the declaration, lower — or the cores unknown | `box/playwright: 2 at most — declared` |
| your setting, and what it replaces | `box/claude: 5 at most — set by you, replaces 3 (8 cores)` ; `no limit — set by you, replaces 3 (8 cores)` |

`cooks <N>` writes `station.capped` for each station, read within the second, kept after a
restart — **it overrides the default cap**, cores and declaration, and stays until another
`cooks <N>` replaces it. **`cooks auto` removes it** (`station.capped` with
`maxCooks: null`): each station returns to its default, that of the cores. A ticket beyond the
cap does not leave on top: it goes to another station that has room, or waits its turn
(`station.held`, reason `cap`). The entry and the machine are common to the project's stations. **Lowering the
cap stops no cook.** It counts only ticket cooks — neither judging nor review —,
and a ticket returned or removed counts until its cook stops. A ticket waiting for the entry stays
queued, its lease does not run.

| Resource | It withholds when | Variable | Default |
|---|---|---|---|
| processor | the one-minute load average, per core, exceeds this threshold | `BRIGADE_MAX_LOAD_PER_CORE` | `1.5` |
| memory | less than this many MB of **available** memory remain | `BRIGADE_MIN_FREE_MEMORY_MB` | a tenth of total memory, `1024` at least |
| disk | less than this many MB remain free on the disk of `BRIGADE_STATE_DIR` | `BRIGADE_MIN_FREE_DISK_MB` | `5120` |

**The memory guard** (#1080). Without `BRIGADE_MIN_FREE_MEMORY_MB`, its minimum derives from the
machine's total memory — that of the service's cgroup if it has less: a tenth, one GB
at least — `3277` MB on 32 GB, `1638` on 16, `1024` on 8 and less. Available memory
(`MemAvailable` on Linux) is what the kernel can still give back: its out-of-memory killer acts
only once almost everything is taken. The station stops taking well before, and what remains keeps `sshd`
up, the runtime that keeps publishing its state — `run status` reads throughout the withholding —, and
the running cooks while they grow. This is the October 20, 2026 outage it prevents:
32 GB, 512 MB of swap, processes killed by the kernel and the box without `ssh` for four hours. A
value in `BRIGADE_MIN_FREE_MEMORY_MB` takes precedence, like the other guardrails: read at the runtime's
startup, `0` to never withhold.

When saturated, it says so: `station.saturated` then `station.relieved`, `MACHINE SATURATED` in `run
status` (`MACHINE SATURÉE` before #940) and `run station`. The fact names the first resource at fault
and, in `also`, the others; it is rewritten when one is added or lifted, not when a value
moves. `run status` names each resource at fault — memory, processor, both —, with what
it has, its threshold, and where the memory one comes from:

```
MACHINE SATURATED for 3 min on CPU and memory — load of 18.4 for at most 12 · 812 MB of memory available for at least 3,205 MB (default: 10% of the machine's 32,050 MB): box/claude takes no more tickets as long as it lasts
MACHINE SATURATED for 1 min on memory — 812 MB of memory available for at least 2,000 MB (set by BRIGADE_MIN_FREE_MEMORY_MB): box/claude takes no more tickets as long as it lasts
```

**The running cooks continue**, and the station resumes on its own when the machine breathes. Saturation lifts with ten percent
margin, resource by resource; `0` for memory or disk: never withheld. **A full rail does not leave in one
block**: during its first minute, each cook launched — and each ticket in the entry — weighs in advance
one unit of load and 512 MB. The gates the pass plays load the machine too.

**A ticket that could leave and does not says why**: `station.held` in the log, a `WITHHOLDING`
line in `run status` (`SE RETIENT` before #940; `withheld` in `run station`), and the reason
on the ticket's line (`withheld by <station> (…)`).

| `reason` | What holds the station back |
|---|---|
| `ramp`, `machine` | the gradual ramp-up (cooks just launched weigh in advance); the machine saturated |
| `cap`, `setups` | the cook cap, the setup cap reached |
| `stopped`, `breaker` | your "stop", the breaker open |
| `station-stopped` | you stopped the project's kitchen on this station alone (see "Starting and stopping the kitchen, station by station") |
| `deploy` | a requested deployment — only readable now in the logs from before the station, which no longer requests a deployment |
| `base` | the integration branch is red (see "The base is judged alone") |
| `setup` | the project's setup is blocked: it failed twice in a row identically (see "The worktree setup runs before the cook") |
| `quota`, `disconnected` | the quota exhausted, the Max connection expired |
| `arbiter`, `unarbitrated` | the arbiter keeps the place for another project; it is unreachable: one cook at a time (see "The arbiter between projects") |

The fact is written when the reason changes, never when no ticket is waiting; `station.released`
when nothing holds back any more. **Two tickets whose zones overlap never leave together.**
**A cook that falls does not take the others with it**; a ticket returned while its cook runs
is taken again only once that cook has stopped, and its zone stays held until then. Limits: a ticket that fails
in a loop accumulates **local branches** in the clone; **no quota gauge** (#63) — raise
the cap in steps.

### Starting and stopping the kitchen, station by station

*Ticket #1183.* The guardrails' "stop" stops the whole kitchen and cuts its cooks within the
second. To take the project off **one** station without cutting anything — your Mac that must
serve something else, a remote station to free up —, the action is per station, the same for a
local station and for a remote one, with nothing to type elsewhere:

```bash
brigade <project> station stop mac/claude     # it takes no more tickets of the project
brigade <project> station start mac/claude    # it resumes
```

- **Stopping is a soft stop.** The station takes nothing more (`station.held`, reason
  `station-stopped`; a remote station that claims receives `mission: null, held: "station-stopped"`).
  **Its cooks in flight are not touched**: a local cook finishes, a remote station keeps renewing
  its lease and returns as before. What it delivers goes to the pass; if it delivers nothing, its
  ticket returns to the rail, as always — nothing is lost. The stopped station does not take it
  again: another station that can cook it takes it, otherwise it waits until the station is started.
- **A stopped box station has no place**: when all the box stations are stopped or saturated, a
  remote station that takes ordinary tickets receives them (see "Ordinary tickets on the chef's
  workstation").
- **The stop holds** after a restart, and even if the station is removed then declared again,
  until the `start`. In the log: `station.stopped` and `station.started`, in the name of the `chef`.
- The action says what it did and how many cooks are finishing; repeated, it rewrites nothing
  (`already stopped`, `already cooking`); a station the project does not declare is refused
  (code 1), naming its own. `run station` shows it on the `cooking` line of each station.

**What each station does with the project** is read in `facts`, field `stations` (see "The facts,
for a program"): `cuisson` is `refused` (the machine's station refuses the project, `refus`
says why — for a local station only), `stopped` (your stop of this station, `arreteeDepuis`; or
your "stop" of the whole kitchen, `arreteeDepuis` null), `saturated` (its machine is at its limit
— for a local station only) or `cooking`, in that order; `cooks` carries its cooks in
flight — when stopped, those finishing —, each with the name of its station.

### The worktree setup runs before the cook

If the project has a `.claude/brigade/worktree-setup.sh` on the cook's branch, the station runs it
before the cook — `worktree-setup.sh <ticket no.> <worktree>` — and **what it exports enters
the cook's environment**. The pass does the same before the gates.

| Case | What the station does |
|---|---|
| The project has no setup | nothing: the cook leaves |
| The setup succeeds | the cook leaves with its exports, and the lease restarts from zero |
| The setup fails, or exceeds **half the lease** | **no cook**: 86 for ten minutes, reason `setup-failed`, then back to queued. The breaker counts nothing |
| The setup fails **like the project's previous one** — same reason, no more refused hosts —, on this ticket or another | **the project is blocked** (`setup.blocked`): no setup is launched any more, for any ticket, until the integration branch has moved |
| A ticket sent back by the pass | the setup is run in the fresh worktree of the resend |
| The repo declares a secret the machine cannot give | **neither setup nor cook**: 86 for ten minutes, reason `secrets-unavailable`; the issue says which, once (see "The project's secrets") |
| Under a per-role identity, the ticket cannot be read on GitHub | **no cook**: 86 for ten minutes, reason `ticket-unreadable` (see "One GitHub identity per role") |

**A failed setup is read on the issue**: exit code or exceeded cap, the end of its output
(project secrets and the shape of Claude's credentials masked), the time of the return, and **the host
the door refused** during this setup, with the action that opens it — a line in
`.claude/brigade/reseau`, merged on the integration branch (see "The whitelist"). **Once
per cause**: again if the reason changes, if a host never named on this ticket
is refused, or if a cook has left since. `run partition` shows the latest refusals.

**A failure that repeats blocks the project, not the ticket.** Retrying every ten minutes, ticket
by ticket, would only repeat the same thing: as soon as a setup fails like the project's previous one
— the same reason (`exit code 1`, exceeded cap), and no refused host that the previous one
did not name —, the station writes `setup.blocked` with the cause and the commit of the integration branch
the worktree was cut from, says so on the issue and in journald, and launches no
setup any more: its stations withhold (`setup`), the 86 tickets return to queued at their
time and stay there. A setup that passes between two failures resets the count; a failure of another
cause follows the ordinary course. **The resume is automatic**: what lifts the cause — a host declared
in `.claude/brigade/reseau`, a fixed setup, a repaired dependency — arrives by being merged
on the integration branch. As long as the project is blocked, the station fetches it at every tick;
as soon as it has moved, `setup.unblocked`, the tickets 86 for a failing setup return to
queued without waiting for their time, and setups restart. If the cause is not lifted, the first
identical failure blocks again at once, on the new base: one setup per merge, not one every
ten minutes. A transient failure (a registry down) blocks like any other: it lifts at the
first merge on the integration branch. The block holds after a restart.

**The same mechanism holds for any cause of setting aside that does not come from the ticket.** A
worktree that does not prepare (`worktree-failed`), a ticket unreadable on GitHub
(`ticket-unreadable`), unavailable secrets (`secrets-unavailable`): the station writes
`aside.failed` at each setting aside; the same cause twice in a row on the project, with no cook
having left in between, writes `aside.blocked` (the cause, the base's commit) — a journald
alert, and an `aside` entry in the chef's queue, with the cause in plain words and the action. These
causes are lifted outside the repo (a value set, GitHub back): the block therefore does not stop the
kitchen, it puts it **at one ticket at a time** — tickets return at their time, only one probes.
**The resume is automatic**: as soon as a cook leaves, the cause is lifted and the entry drops; if another
cause appears, `aside.unblocked` (`why: cause`) and that one counts; if the integration
branch moves, `aside.unblocked` (`why: base`) and the tickets 86 for this cause return
without waiting. The setup keeps its own block, above, unchanged.

**A worktree that does not prepare is told to the project, not only to journald** (*ticket #1118*).
Its `ticket.86` carries the reason in git's words (`why`) and, if the station cannot
fetch from the repo or push to it, the refused access and its action (`access`: `blocked`, `reason`,
`gesture` — the check of `projets/acces.ts`, done after the failure, under the environment of
its fetches). As long as a failure holds, **each attempt rechecks access first**: if refused, it
fails at once, fetching nothing, and pushes the next one back ten minutes; once the action is done
(`gh auth setup-git`, for example), the next attempt prepares its worktree in the same process,
without restarting, and `worktree.prepared` closes the failure. The station publishes the current failure in the
project's tracking (`worktree`, see [`station-machine.md`](station-machine.md)), until that attempt.

**The block enters your queue.** As long as it holds, the `awaiting` block carries a `setup` entry, a
single one for the project whatever the number of tickets withheld, with the cause in plain words and the action:
``setup impossible: the door refuses `cdn.sheetjs.com` (…) — to declare in `.claude/brigade/reseau`
of the project, one line per host, then merge on the integration branch``; with no refused host, the
setup itself is to be fixed, and the entry names the issue where to read what it said. The `setup` line
at the top of `status` repeats it, and the kitchen is `held` for the app — unless a remote
station, which prepares its setup on its workstation, can still cook. At `setup.unblocked`,
the entry and the line disappear on their own. See "What awaits the chef".

When writing the script: **the runtime's `BRIGADE_*` variables do not reach it**, nor
the cook; what it exports does — except `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and
`CLAUDE_CODE_OAUTH_TOKEN`, which the station removes. **The secrets the repo declares reach
it**, masked in what it says. **It lets nothing run** in the background.

### Calibrating a ticket

**No cook leaves without calibration**, set on the issue by two labels — by the manager if it is
on, by hand otherwise. No default value.
`model:` is `opus`, `sonnet` or `haiku`; `effort:` is `low`, `medium`, `high`, `xhigh` or
`max`. Without one of the two, with two for the same dimension or a value outside the list, the ticket is
**refused**: 86, reason `no-calibration`, a comment says what is missing. Once the labels are set, it
returns to queued on its own, at the next poll.

### A ticket's card

**The tickets it awaits**, **the file zone it owns** and **the capabilities it asks of
its station** live in **a comment on its issue**, identified by a marker:

```
<!-- brigade:fiche -->
**Ticket card** — read by the runtime, editable by hand.
- awaiting: #68, #69
- zone: runtime/src/rail.ts, runtime/test/rail.test.ts
- requiert: navigateur-headless
```

`awaiting`: `#N`s, separated by commas or spaces. `zone`: paths relative to the
repo root — files or folders —, separated by commas. `requiert`: capability names,
separated by commas or spaces — the line is **optional**, and a card that
lacks it reads exactly as before (see "The capabilities a ticket asks for").
Without a card, a ticket awaits no one, owns nothing and asks for nothing. **It is edited by hand**, by
editing the comment; reading tolerates case, bold, the bullet or its absence, order, and
prose around it. The marker **counts only at the start of a line, outside a code block**. The
manager writes the card of the tickets it splits.

| What the issue carries | What the runtime does with it |
|---|---|
| An unknown key (`budget : 40`); a bullet that is not `key: value`; a key set twice | unreadable card |
| A value that is not a `#N`, not a path in the repo (absolute, `~`, `..`), or not a capability name (`chrome/connecté`) | unreadable card — the value is quoted |
| A **pattern** in the zone (`*`, `?`) | unreadable card: a folder already owns everything it contains |
| Two cards | unreadable card, **neither is read** |
| A `#N` that designates no issue, the ticket itself, or a PR | unreadable card |
| `awaiting` entries that form a cycle between rail tickets | unreadable card for each ticket in the cycle |
| A card set by someone without control of the repo | **ignored**, and said in journald (`card ignored on ticket #N`) |

With an unreadable card, the ticket is **refused** at the take: 86, reason `unreadable-card`, a comment
lists what to fix. Readable or deleted, it returns on its own (`ticket.released`, reason
`card-readable`); what remains to fix is read in `run rail`. The card is reread when the issue
changes, and enters the log (`ticket.arrived`, `ticket.changed`, field `card`).

### The capabilities a ticket asks for

**A station provides capabilities** (the `stations` decision, see "Declaring the stations"); **a
ticket asks for some** through the `requiert` line of its card. The manager sets it at the split, for a
ticket infeasible without it — it reads what the project's stations provide —; it is edited by
hand like the rest. Most tickets ask for none.

| What the ticket asks for | Where it goes |
|---|---|
| Nothing | to the first station, in declaration order, that nothing holds back — **whatever it provides** |
| One or more capabilities | to the first free station that provides **all** of them; what it provides in addition does not rule it out |
| A capability provided by a **full or withholding** station | nowhere for now: it waits for its place, no other takes it, and `status` says which one holds it back |
| A capability that **no declared station provides** — or several that none provides together | **it does not leave**: 86, no cook |

- **Only the capability chooses the station, never a preference.** A specialty (security, writing,
  DB) is not a capability: nothing in the runtime rules out a station because a ticket "would fit
  better" elsewhere.
- **Names are compared as they are** (`chrome-connecté` is not `chrome-connecte`): the runtime
  recognizes none. Only the way an accent is written is indifferent.
- **With no station that provides it, the ticket is 86 before any take** — written by the runtime, reason
  `no-station: chrome-connecté` (`no-station: a + b` when each is provided somewhere, never
  together), with no return time. **No cook is launched**, no worktree prepared; the other
  tickets leave, and it does not hold its zone. Its issue gets a comment that names what is
  missing and the declared stations.
- **The manager takes it up before the chef** (manager on). It rewrites or resplits the ticket so
  that it no longer needs the capability: `manager.capability-resplit` in the log, the ticket leaves the
  rail (86 `manager:split`), its sub-tickets are born like those of an epic, and nothing arrives in
  TODO. A ticket born of such a rewrite is not rewritten twice. If the rewrite is
  impossible, the manager sets a `gesture` card (`manager.capability-gestured`) that names the access to
  give and why the ticket cannot do without it; the ticket stays 86, and the card leaves TODO as soon
  as it is no longer in this case. Manager off, nothing takes it up: the block below shows it as is.
- **`status` says what is missing and the action that would provide it**, in the `awaiting` block (manager off):

  ```
  #14  since 3 min  no station provides `chrome-connecté` — to provide: declare a station that provides it with `brigade <project> station stations <machine>/<engine>:<cook cap>:chrome-connecté`, or remove `chrome-connecté` from the `requiert` line of its card — it leaves on its own
  ```

- **It returns to queued on its own** (`ticket.released`, reason `capabilities-reread`): at restart,
  if a declared station now provides what it asks for; at the poll, if its card no longer asks for it.
  A card that now asks for something else that is missing sends it back to 86, under the new reason.
- **With no station declared at all**, a ticket that asks for a capability is 86 in the same way;
  one that asks for none waits, as before.
- **Asking for a capability authorizes nothing.** It says in which station the ticket leaves; what its
  cook is allowed to do does not change. `accès-prod` written on a `requiert` line is a name
  like any other: the list of what no grant authorizes (`runtime/src/grant.ts`) stays what
  it was, and `grant -- enable acces-prod` is refused as before.
