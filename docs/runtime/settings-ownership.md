# Who owns each setting: the project or the station

Epic [#1665](https://github.com/benomite/brigade/issues/1665) moves project decisions out of the box and into what the chef keeps. This audit says which setting goes where, for every setting the runtime reads and every `brigade <project> station` gesture, as found in `runtime/src` and in the CLI help (`brigade <project> help`, `station -- help`).

## How to read it

Words are those of [`../glossary.md`](../glossary.md).

- **project** — a decision about *this project*: what its kitchen may spend, how its roles are calibrated, what counts as drift for it. It is the same whichever box serves the project, so every station serving it must get the same value. It belongs to the chef and the project, outside any box.
- **station** — a fact or choice about *this machine* (a box or a workstation): its engines, capacity, secrets, paths, ports, log. It stays on the station.

Each row has one owner. Station rows in §1 are capacity, operations on a running machine, or machine facts (the project does not decide what a machine can do); project rows are what the project spends, tests, calibrates or counts as drift. A project row names the ticket that moves it: [#1668](https://github.com/benomite/brigade/issues/1668) (the manager and reviewer calibration and the project's caps) or the ticket named in the row.

Today the "station" gestures write a decision to the project's **log** (`decision.set`, read at the next read, no restart). The column says where a "project" row *belongs*, not where it is kept now. The file `.claude/brigade/projet.json` ([`../reglages.md`](../reglages.md)) already carries the key named in a row's "Moved by" column; **the file's value wins over the box's decision or variable**, so a box whose project has no file keeps working on its gestures and variables. Keys under `gates` (#1672) and `rail`/`lessons`/`commonPaths` (#1673) are read when the kitchen opens.

## 1. The `brigade <project> station` gestures

| Gesture | What it sets | Belongs to | Moved by (`projet.json` key) |
|---|---|---|---|
| `station` (no argument) | Shows the cap, the cooks, what was consumed, the decisions | station | — |
| `cooks <N>` / `cooks auto` | The cap of simultaneous cooks of every station (0: no limit); `auto` withdraws it, the default derived from the cores returns | station | — |
| `stop <station>` / `start <station>` | Stops or restarts the project's cooking on one station | station | — |
| `stations <declaration>` | Which stations serve the project, each as `<machine>/<engine>:<cooks cap>:<capabilities>[:remote…]` | station | — |
| `seuil-ticket` | Drift: tokens of the most expensive ticket (`BRIGADE_DRIFT_TICKET_TOKENS`) | project | [#1671](https://github.com/benomite/brigade/issues/1671) `drift.ticketTokens` |
| `seuil-perdus` | Drift: lost tokens (`BRIGADE_DRIFT_LOST_TOKENS`) | project | #1671 `drift.lostTokens` |
| `seuil-renvois` | Drift: share delivered first try (`BRIGADE_DRIFT_FIRST_TRY_PERCENT`) | project | #1671 `drift.firstTryPercent` |
| `fenetre-renvois` | Window of that threshold, in tickets (`BRIGADE_DRIFT_FIRST_TRY_WINDOW`) | project | #1671 `drift.firstTryWindow` |
| `budget-gates` | Wall-clock budget of one gates run (`BRIGADE_GATES_BUDGET_SECONDS`) | project | [#1672](https://github.com/benomite/brigade/issues/1672) `gates.durationBudgetSeconds` |
| `budget-gates-cpu` | CPU budget of one gates run (`BRIGADE_GATES_BUDGET_CPU_SECONDS`) | project | #1672 `gates.processorBudgetSeconds` |
| `budget-base` | Wall-clock budget of the full run on the base (`BRIGADE_GATES_BASE_BUDGET_SECONDS`) | project | #1672 `gates.baseDurationBudgetSeconds` |
| `budget-base-cpu` | CPU budget of the full run on the base (`BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS`) | project | #1672 `gates.baseProcessorBudgetSeconds` |
| `manager-modele`, `manager-effort` | Model, effort of the manager's judgments (`BRIGADE_MANAGER_MODEL`, `BRIGADE_MANAGER_EFFORT`) | project | #1668 |
| `reviewer-modele`, `reviewer-effort` | Model, effort of the reviewer's reviews (`BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT`) | project | #1668 |
| `closer-modele`, `closer-effort` | Model, effort of the closing pass (`BRIGADE_CLOSING_MODEL`, `BRIGADE_CLOSING_EFFORT`) | project | [#1684](https://github.com/benomite/brigade/issues/1684) `closer.calibration.model`, `closer.calibration.effort` |
| `closer-cooks` | The pass starts when fewer cooks than this are in flight (`BRIGADE_CLOSING_COOKS`) | project | #1684 `closer.cooksBelow` |
| `closer-tokens` | Token cap of a closing pass (`BRIGADE_CLOSING_MAX_TOKENS`) | project | #1684 `closer.maxTokens` |
| `closer-retraits` | Cap on the lines a closing pass may remove (`BRIGADE_CLOSING_MAX_REMOVED_LINES`) | project | #1684 `closer.maxRemovedLines` |
| `ceiling-modele`, `ceiling-effort` | Calibration ceiling: highest model and effort for a red ticket (`BRIGADE_CEILING_MODEL`, `BRIGADE_CEILING_EFFORT`) | project | [#1670](https://github.com/benomite/brigade/issues/1670) `ceiling`; order: project decisions, then box decision, then default; `station ceiling-*` prints `source: project decisions`, `source: box` or `source: default` |
| `remove <geste>` | Withdraws a decision set by one of the gestures above | follows the gesture | — |
| `help` | Lists the gestures | station | — |

The old names `retirer` and `aide` still answer and say the new word. A `gates` budget gesture still sets its value on a box with no file.

## 2. Settings read from the service environment and the station line

These are the `BRIGADE_*` variables the runtime reads from the service environment (the station's line for the project). The variables named in §1 (`BRIGADE_STATIONS`, `BRIGADE_MANAGER_*`, `BRIGADE_REVIEWER_*`, `BRIGADE_CLOSING_*`, `BRIGADE_CEILING_*`, `BRIGADE_DRIFT_TICKET_TOKENS`, `BRIGADE_DRIFT_LOST_TOKENS`, `BRIGADE_DRIFT_FIRST_TRY_*`, `BRIGADE_GATES_*BUDGET*`) are no longer read from the environment.

### 2.1 The project's caps and the breaker

All project, moved by [#1668](https://github.com/benomite/brigade/issues/1668): one family of caps.

| Setting | What it sets |
|---|---|
| `BRIGADE_MAX_MINUTES` | Cap on a cook's duration (60) |
| `BRIGADE_MAX_TOKENS` | Cap on a cook's tokens (2,000,000) |
| `BRIGADE_IDLE_MINUTES` | Idle delay after which a cook is stopped (10) |
| `BRIGADE_BREAKER_FAILURES` | Failures in a row that open the breaker (3) |

### 2.2 Project policy still set on the box

All project: they describe the project's code, tests, tickets, CI or notebook. The `projet.json` key wins over the box.

| Setting | What it sets | `projet.json` key |
|---|---|---|
| `BRIGADE_DRIFT_CONTEXT_KB` | Drift: size of the context a cook receives, in KB | #1671 `drift.contextKb` |
| `BRIGADE_DRIFT_GATES_SECONDS` | Drift: duration of the gates, in seconds | #1671 `drift.gatesSeconds` |
| `BRIGADE_DRIFT_GROWTH_PERCENT` | Drift: growth of the project's measures, in % | #1671 `drift.growthPercent` |
| `BRIGADE_DRIFT_MERGES` | Drift measure: number of merges per reading | #1671 `drift.merges` |
| `BRIGADE_DRIFT_REPO_MB` | Drift: size of the repository, in MB | #1671 `drift.repoMb` |
| `BRIGADE_DRIFT_TESTS` | Drift: number of tests | #1671 `drift.tests` |
| `BRIGADE_DRIFT_TESTS_SECONDS` | Drift: duration of the tests, in seconds | #1671 `drift.testsSeconds` |
| `BRIGADE_CORRECTION_THRESHOLD` | How many repeated corrections raise a proposal (2 or more) | #1671 `correction.threshold` |
| `BRIGADE_CORRECTION_WINDOW` | Window, in tickets, in which corrections are counted | #1671 `correction.window` |
| `BRIGADE_PROFILE_WINDOW` | Window, in tickets, from which a cook profile is computed | #1671 `profile.window` |
| `BRIGADE_PROFILE_MIN_TICKETS` | Tickets needed in that window before a profile is proposed | #1671 `profile.minTickets` |
| `BRIGADE_PROFILE_GAP_POINTS` | Gap, in points, that makes a profile worth proposing | #1671 `profile.gapPoints` |
| `BRIGADE_GATES_TIMEOUT_SECONDS` | How long the pass waits for the gates | #1672 `gates.timeoutSeconds` |
| `BRIGADE_CI_WAIT_SECONDS` | How long the pass waits for CI | #1672 `gates.ciWaitSeconds` |
| `BRIGADE_LEASE_SECONDS` | The lease on a taken ticket | [#1673](https://github.com/benomite/brigade/issues/1673) `rail.leaseSeconds` |
| `BRIGADE_COMMON_PATHS` | Paths the rail treats as common to all tickets | #1673 `commonPaths` |
| `BRIGADE_ROADMAP_ISSUE` | The roadmap issue the manager reads | #1673 `rail.roadmapIssue` |
| `BRIGADE_INJECTED_LESSONS` | How many lessons a cook receives (20) | #1673 `lessons.injected` |
| `BRIGADE_PROMOTION_RETROS` | Retros needed before a lesson is promoted | #1673 `lessons.promotionRetros` |
| `BRIGADE_PROVISIONAL_EXPIRY_TICKETS` | Tickets after which a provisional lesson expires | #1673 `lessons.provisionalExpiryTickets` |
| `BRIGADE_PROMOTED_EXPIRY_TICKETS` | Tickets after which a promoted lesson expires | #1673 `lessons.promotedExpiryTickets` |
| `BRIGADE_SENDBACK_PROMOTION_GAP` | Send-back gap that triggers a lesson promotion | #1673 `lessons.sendbackPromotionGap` |

### 2.3 Identity of the project on the station

All station. `BRIGADE_BASE_BRANCH`'s project value is in `projet.json` (`../reglages.md`).

| Setting | What it sets |
|---|---|
| `BRIGADE_PROJECT` | Name of the project: first field of the station's line |
| `BRIGADE_GITHUB_REPO` | Repository of the project: second field of the line |
| `BRIGADE_BASE_BRANCH` | Integration branch: third field of the line |
| `BRIGADE_REPO_DIR` | The station's reserved clone of the project (a path of a machine) |
| `BRIGADE_WORKTREES_DIR` | The station's workshop for worktrees (a path) |
| `BRIGADE_PROJECTS_DIR` | Where local copies of projects are kept (a path) |
| `BRIGADE_STATION_DIR` | The station's own directory (a path) |
| `BRIGADE_STATE_DIR` | The project's state directory, where the **log** lives (a path) |
| `BRIGADE_PORT` | The project's port (a port of a machine) |

### 2.4 Engines and tools

All station: what is installed on, or identifies, the machine.

| Setting | What it sets |
|---|---|
| `BRIGADE_CLAUDE_BIN` | The `claude` program the station runs (its **engine**) |
| `BRIGADE_GH_BIN`, `BRIGADE_GIT_BIN`, `BRIGADE_SYSTEMCTL_BIN`, `BRIGADE_SANDBOX_BIN` | The `gh`, `git`, `systemctl` and sandbox (bwrap) programs |
| `BRIGADE_STATION_NOM` | Name the station announces (the host name by default) |
| `BRIGADE_STATION_VERSION` | Version the station announces |
| `BRIGADE_STATION_PORTES` | The station's doors file |
| `BRIGADE_STATION_TICK_S`, `BRIGADE_STATION_ECART_S` | The station's tick, and the gap tolerated between ticks, in seconds |
| `BRIGADE_STATION_RELAIS_MS` | How often each project looks at what the station's update gave, in milliseconds (a test station's) |
| `BRIGADE_PRESENCE_MINUTES` | How long a station counts as present after its last sign |
| `BRIGADE_MISE_A_JOUR_DIR` | Directory of the station's own update |
| `BRIGADE_MISE_A_JOUR_SOURCE` | Where the station finds new versions of brigade |
| `BRIGADE_MISE_A_JOUR_GARDE_S` | Time left to the station to start after an update, in seconds |
| `BRIGADE_SECOND_DIR`, `BRIGADE_SECOND_PROPOSAL` | The second's directory; the channel of its proposals |
| `BRIGADE_APP_CONFIG` | The app's configuration file (`app.json`), on the chef's Mac |
| `BRIGADE_REGISTRE_DIR` | The registry of enrolled stations |
| `BRIGADE_INSTALLER_CONFIG` | The installer's configuration |

### 2.5 Capacity

All station: capacity, isolation and ports are properties of the machine.

| Setting | What it sets |
|---|---|
| `BRIGADE_MAX_LOAD_PER_CORE` | Load per core above which the machine takes no cook (1.5) |
| `BRIGADE_MIN_FREE_DISK_MB` | Free disk below which the machine takes no cook |
| `BRIGADE_MIN_FREE_MEMORY_MB` | Free memory below which the machine takes no cook |
| `BRIGADE_MAX_SETUPS` | Cooks entering a worktree setup at a time |
| `BRIGADE_MAX_JUDGEMENTS` | Deliveries the pass judges at once, their zones not overlapping (3); their gates run side by side |
| `BRIGADE_ARBITER_MAX_COOKS` | Cooks the arbiter lets all projects run together |
| `BRIGADE_ARBITER_PORT`, `BRIGADE_ARBITER_STATE_DIR` | Port and state directory of the arbiter |
| `BRIGADE_COMMON_TIER_PROJECTS` | Number of projects from which a proposal rises to the common tier |
| `BRIGADE_SANDBOX_HIDDEN` | What a cook cannot see in the partition |
| `BRIGADE_SANDBOX_PRIVATE` | Entries of the account's home kept private |
| `BRIGADE_SANDBOX_CACHES` | Caches shared into the sandbox |
| `BRIGADE_PROXY_PORT` | Port of the proxy a cook goes out through |

### 2.6 Secrets

All station: a **secret** never leaves its machine.

| Setting | What it sets |
|---|---|
| `BRIGADE_SECRETS_FILE` | The project's secrets file |
| `BRIGADE_CLAUDE_TOKEN_FILE` | The Max token |
| `BRIGADE_GITHUB_APPS_DIR` | The GitHub Apps' keys |
| `BRIGADE_GITHUB_API_URL` | The API the Apps call |
| `BRIGADE_SESSION_STATE`, `BRIGADE_SESSION_LIFETIME`, `BRIGADE_SESSION_WARNING` | State file of the session token's renewal; how long a token lives; notice before it expires |
| `BRIGADE_FICHIER_PROTEGE` | Internal: file whose rights are tightened |

### 2.7 Log and backups

All station: the log and the disk are the machine's.

| Setting | What it sets |
|---|---|
| `BRIGADE_BACKUP_DIR` | Where the **log** is backed up |
| `BRIGADE_BACKUP_KEEP`, `BRIGADE_BACKUP_MAX_AGE_HOURS` | How many dated backups are kept; age past which the last is reported stale |
| `BRIGADE_TRANSCRIPTS_KEEP_DAYS` | How long cook transcripts are kept |

(`BRIGADE_SUR_L_ISSUE` and `BRIGADE_SANDBOX_` are internal markers, not settings.)

## 3. Other commands that write something

| Command | What it writes | Belongs to |
|---|---|---|
| `setting ceiling \| manager \| reviewer \| branch` | Nothing since #2061: it refuses, and names `projet.json` to change by a pull request on GitHub | project (already in the project's repository) |
| `installation stations …`, `installation decisions …` | The same stations and decisions as §1, at installation time | follows §1 |
| `arbiter weight \| remove` | A project's weight on the machine | station: shares one machine between projects |
| `guardrails stop \| resume \| pause`, `switch on \| off` | The live state of the kitchen (written to the log) | station: an operation, not a setting |
| `grant … merge`, `rail`, `manager`, `closing`, `backup`, `restore`, `pull`, `door` | Operations on tickets, backups | station: operations, not settings |
