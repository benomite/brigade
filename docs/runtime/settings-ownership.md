# Who owns each setting: the project or the station

Epic [#1665](https://github.com/benomite/brigade/issues/1665) moves project decisions out of the box and into what the chef keeps. This page is the audit that says which setting goes where. It lists every setting the runtime reads and every `brigade <project> station` gesture, as found in `runtime/src` (`montrer-station.ts`, `decisions.ts`, `poser-decisions.ts`, `plafonds.ts`, `station/configuration.ts` and the modules that read `BRIGADE_*` variables) and in the CLI help (`brigade <project> help`, `station -- help`).

## How to read it

Words are those of [`../glossary.md`](../glossary.md).

- **project** — a decision about *this project*: what its kitchen may spend, how its roles are calibrated, what counts as drift for it. It is the same whichever box serves the project, so a second station must get the same value. It belongs to the chef and to the project, outside any box. It is not a secret and not a fact of one machine.
- **station** — a fact or a choice about *this machine* (a box or a workstation): its engines, its capacity, its secrets, its paths, its ports, its log. Another machine would answer differently. It stays on the station.

Each row has one owner. When a row mixes both, the reason says which side was kept and why. A project row names the ticket that moves it: [#1668](https://github.com/benomite/brigade/issues/1668) (the reader of the chef's decisions, for the closer settings, the manager and reviewer calibration and the project's caps) or a follow-up opened by this audit.

Today the "station" gestures write a decision to the project's **log** (`decision.set`, read at the next read, no restart). A "project" row in this page is not yet read from anywhere else: the column says where it *belongs*, not where it is kept now. The file `.claude/brigade/projet.json` ([`../reglages.md`](../reglages.md)) already carries the manager and reviewer calibrations and the ceiling for the project; the sections below do not change that.

## 1. The `brigade <project> station` gestures

| Gesture | What it sets | Belongs to | Reason | Moved by |
|---|---|---|---|---|
| `station` (no argument) | Shows the cap, the cooks, the servers, what was consumed, the decisions | station | Read-only view of the machine | — |
| `cooks <N>` | The cap of simultaneous cooks of every station (0: no limit) | station | Capacity: it follows the machine's cores | — |
| `cooks auto` | Withdraws that cap; the default derived from the cores returns | station | Capacity | — |
| `stop <station>` / `start <station>` | Stops or restarts the project's cooking on one station | station | An operation on a running machine, not a decision carried by the project | — |
| `stations <declaration>` | Which stations serve the project, each as `<machine>/<engine>:<cooks cap>:<capabilities>[:remote…]` | station | Every field is a machine fact (engine, capacity, capabilities, remote or not); the project does not decide what a machine can do | — |
| `seuil-ticket` | Drift threshold: tokens of the most expensive ticket (`BRIGADE_DRIFT_TICKET_TOKENS`) | project | What is too expensive for this project | [#1671](https://github.com/benomite/brigade/issues/1671) *Move drift, correction and profile thresholds…* |
| `seuil-perdus` | Drift threshold: lost tokens (`BRIGADE_DRIFT_LOST_TOKENS`) | project | Same | [#1671](https://github.com/benomite/brigade/issues/1671) |
| `seuil-renvois` | Drift threshold: share delivered first try (`BRIGADE_DRIFT_FIRST_TRY_PERCENT`) | project | Same | [#1671](https://github.com/benomite/brigade/issues/1671) |
| `fenetre-renvois` | Window of that threshold, in tickets (`BRIGADE_DRIFT_FIRST_TRY_WINDOW`) | project | Same | [#1671](https://github.com/benomite/brigade/issues/1671) |
| `budget-gates` | Wall-clock budget of one gates run (`BRIGADE_GATES_BUDGET_SECONDS`) | project | Depends on the project's tests, not on the machine | [#1672](https://github.com/benomite/brigade/issues/1672) *Move the gates budgets, gates timeout and CI wait…* |
| `budget-gates-cpu` | CPU budget of one gates run (`BRIGADE_GATES_BUDGET_CPU_SECONDS`) | project | Same | [#1672](https://github.com/benomite/brigade/issues/1672) |
| `budget-base` | Wall-clock budget of the full run on the base (`BRIGADE_GATES_BASE_BUDGET_SECONDS`) | project | Same | [#1672](https://github.com/benomite/brigade/issues/1672) |
| `budget-base-cpu` | CPU budget of the full run on the base (`BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS`) | project | Same | [#1672](https://github.com/benomite/brigade/issues/1672) |
| `manager-modele` | Model of the manager's judgments (`BRIGADE_MANAGER_MODEL`) | project | Manager calibration | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `manager-effort` | Effort of the manager's judgments (`BRIGADE_MANAGER_EFFORT`) | project | Manager calibration | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `reviewer-modele` | Model of the reviewer's reviews (`BRIGADE_REVIEWER_MODEL`) | project | Reviewer calibration | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `reviewer-effort` | Effort of the reviewer's reviews (`BRIGADE_REVIEWER_EFFORT`) | project | Reviewer calibration | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `closer-modele` | Model of the closing pass (`BRIGADE_CLOSING_MODEL`) | project | How the project's closing is calibrated | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `closer-effort` | Effort of the closing pass (`BRIGADE_CLOSING_EFFORT`) | project | Same | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `closer-cooks` | The pass starts when fewer cooks than this are in flight (`BRIGADE_CLOSING_COOKS`) | project | How much of the kitchen the project lets its closing take | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `closer-tokens` | Token cap of a closing pass (`BRIGADE_CLOSING_MAX_TOKENS`) | project | A cap on the project's spending | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `closer-retraits` | Cap on the lines a closing pass may remove (`BRIGADE_CLOSING_MAX_REMOVED_LINES`) | project | A cap on what the project lets be cut | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `ceiling-modele` | Calibration ceiling: highest model for a red ticket (`BRIGADE_CEILING_MODEL`) | project | Raising a ticket's calibration is a project choice | [#1670](https://github.com/benomite/brigade/issues/1670) *Move the manager's calibration ceiling…* |
| `ceiling-effort` | Calibration ceiling: highest effort (`BRIGADE_CEILING_EFFORT`) | project | Same | [#1670](https://github.com/benomite/brigade/issues/1670) |
| `remove <geste>` | Withdraws a decision set by one of the gestures above | follows the gesture | It undoes the gesture it names; the row of that gesture decides | — |
| `help` | Lists the gestures | station | Read-only | — |

The old names `retirer` and `aide` still answer and say the new word.

## 2. Settings read from the service environment and the station line

These are the `BRIGADE_*` variables the runtime reads from the service environment (the station's line for the project). Variables the old "decisions" list names (`BRIGADE_STATIONS`, `BRIGADE_MANAGER_*`, `BRIGADE_REVIEWER_*`, `BRIGADE_CLOSING_*`, `BRIGADE_CEILING_*`, `BRIGADE_DRIFT_TICKET_TOKENS`, `BRIGADE_DRIFT_LOST_TOKENS`, `BRIGADE_DRIFT_FIRST_TRY_*`, `BRIGADE_GATES_*BUDGET*`) are no longer read from the environment: they are the gestures of §1.

### 2.1 The project's caps and the breaker

| Setting | What it sets | Belongs to | Reason | Moved by |
|---|---|---|---|---|
| `BRIGADE_MAX_TURNS` | Cap on a cook's turns (100) | project | What a ticket may cost is the project's decision | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `BRIGADE_MAX_MINUTES` | Cap on a cook's duration (60) | project | Same | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `BRIGADE_MAX_TOKENS` | Cap on a cook's tokens (2,000,000) | project | Same | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `BRIGADE_IDLE_MINUTES` | Idle delay after which a cook is stopped (10) | project | Same family of caps | [#1668](https://github.com/benomite/brigade/issues/1668) |
| `BRIGADE_BREAKER_FAILURES` | Failures in a row that open the breaker (3) | project | Same family of caps | [#1668](https://github.com/benomite/brigade/issues/1668) |

### 2.2 Project policy still set on the box

| Setting | What it sets | Belongs to | Reason | Moved by |
|---|---|---|---|---|
| `BRIGADE_DRIFT_CONTEXT_KB`, `BRIGADE_DRIFT_GATES_SECONDS`, `BRIGADE_DRIFT_GROWTH_PERCENT`, `BRIGADE_DRIFT_MERGES`, `BRIGADE_DRIFT_REPO_MB`, `BRIGADE_DRIFT_TESTS`, `BRIGADE_DRIFT_TESTS_SECONDS` | The other drift thresholds | project | What counts as drift is about the project's code and tests | [#1671](https://github.com/benomite/brigade/issues/1671) |
| `BRIGADE_CORRECTION_THRESHOLD`, `BRIGADE_CORRECTION_WINDOW` | When repeated corrections raise a proposal | project | A rule about the project's work | [#1671](https://github.com/benomite/brigade/issues/1671) |
| `BRIGADE_PROFILE_WINDOW`, `BRIGADE_PROFILE_MIN_TICKETS`, `BRIGADE_PROFILE_GAP_POINTS` | When a cook profile is proposed | project | Computed from the project's tickets | [#1671](https://github.com/benomite/brigade/issues/1671) |
| `BRIGADE_GATES_TIMEOUT_SECONDS`, `BRIGADE_CI_WAIT_SECONDS` | How long the pass waits for the gates and for CI | project | Depends on the project's tests and CI | [#1672](https://github.com/benomite/brigade/issues/1672) |
| `BRIGADE_LEASE_SECONDS` | The lease on a taken ticket | project | Rail rule for the project's tickets | [#1673](https://github.com/benomite/brigade/issues/1673) *Move the rail and lessons policy…* |
| `BRIGADE_COMMON_PATHS` | Paths the rail treats as common to all tickets | project | Describes the project's tree | [#1673](https://github.com/benomite/brigade/issues/1673) |
| `BRIGADE_ROADMAP_ISSUE` | The roadmap issue the manager reads | project | Names a ticket of the project | [#1673](https://github.com/benomite/brigade/issues/1673) |
| `BRIGADE_INJECTED_LESSONS` | How many lessons a cook receives (20) | project | Policy on the project's notebook | [#1673](https://github.com/benomite/brigade/issues/1673) |
| `BRIGADE_PROMOTION_RETROS`, `BRIGADE_PROVISIONAL_EXPIRY_TICKETS`, `BRIGADE_PROMOTED_EXPIRY_TICKETS`, `BRIGADE_SENDBACK_PROMOTION_GAP` | When a lesson is promoted or expires | project | Policy on the project's notebook | [#1673](https://github.com/benomite/brigade/issues/1673) |

### 2.3 Identity of the project on the station

| Setting | What it sets | Belongs to | Reason |
|---|---|---|---|
| `BRIGADE_PROJECT`, `BRIGADE_GITHUB_REPO`, `BRIGADE_BASE_BRANCH` | Name, repository and integration branch: the first three fields of the station's line | station | They tell this station which project to serve; the project's own value of the branch is `projet.json` (`../reglages.md`) |
| `BRIGADE_REPO_DIR`, `BRIGADE_WORKTREES_DIR`, `BRIGADE_PROJECTS_DIR`, `BRIGADE_STATION_DIR`, `BRIGADE_STATE_DIR` | Where the clone, the worktrees, the station and the state (the **log**) live | station | Paths of a machine |
| `BRIGADE_PORT` | The project's port | station | A port of a machine |

### 2.4 Engines and tools

| Setting | What it sets | Belongs to | Reason |
|---|---|---|---|
| `BRIGADE_CLAUDE_BIN`, `BRIGADE_GH_BIN`, `BRIGADE_GIT_BIN`, `BRIGADE_SSH_BIN`, `BRIGADE_SYSTEMCTL_BIN`, `BRIGADE_TAILSCALE_BIN`, `BRIGADE_SANDBOX_BIN` | The programs the station runs (the **engines** and their tools) | station | What is installed on the machine |
| `BRIGADE_STATION_NOM`, `BRIGADE_STATION_VERSION`, `BRIGADE_STATION_PORTES`, `BRIGADE_STATION_TICK_S`, `BRIGADE_STATION_ECART_S`, `BRIGADE_PRESENCE_MINUTES` | Name, version, doors and timing of the station | station | Identity and rhythm of the machine |
| `BRIGADE_MISE_A_JOUR_DIR`, `BRIGADE_MISE_A_JOUR_SOURCE`, `BRIGADE_MISE_A_JOUR_GARDE_S` | The station's own update | station | Which brigade runs on this machine |
| `BRIGADE_GUICHET_TELEPHONES`, `BRIGADE_SECOND_DIR`, `BRIGADE_SECOND_PROPOSAL`, `BRIGADE_APP_CONFIG`, `BRIGADE_REGISTRE_DIR` | Phones, the second, the app's file, the station registry | station | Files and channels of one machine |
| `BRIGADE_INSTALLER_CONFIG` | The installer's configuration | station | Installing this machine |

### 2.5 Capacity

| Setting | What it sets | Belongs to | Reason |
|---|---|---|---|
| `BRIGADE_MAX_LOAD_PER_CORE`, `BRIGADE_MIN_FREE_DISK_MB`, `BRIGADE_MIN_FREE_MEMORY_MB` | When the machine is too loaded to take a cook | station | The machine's capacity |
| `BRIGADE_MAX_SETUPS` | Cooks entering a worktree setup at a time | station | The machine's capacity |
| `BRIGADE_ARBITER_MAX_COOKS`, `BRIGADE_ARBITER_PORT`, `BRIGADE_ARBITER_STATE_DIR` | The arbiter that shares the machine between projects | station | It splits one machine, across projects |
| `BRIGADE_COMMON_TIER_PROJECTS` | Number of projects from which a proposal rises to the common tier | station | Counts across the projects of a machine |
| `BRIGADE_SANDBOX_HIDDEN`, `BRIGADE_SANDBOX_PRIVATE`, `BRIGADE_SANDBOX_CACHES`, `BRIGADE_PROXY_PORT` | The partition: what a cook cannot see, the caches, the proxy | station | Isolation is a property of the machine |

### 2.6 Secrets

| Setting | What it sets | Belongs to | Reason |
|---|---|---|---|
| `BRIGADE_SECRETS_FILE` | The project's secrets file | station | A **secret** never leaves its machine |
| `BRIGADE_CLAUDE_TOKEN_FILE` | The Max token | station | Same |
| `BRIGADE_GITHUB_APPS_DIR`, `BRIGADE_GITHUB_API_URL` | The GitHub Apps' keys and the API they call | station | Same |
| `BRIGADE_SESSION_STATE`, `BRIGADE_SESSION_LIFETIME`, `BRIGADE_SESSION_WARNING` | The renewal of the session token | station | Same |
| `BRIGADE_FICHIER_PROTEGE` | Internal: file whose rights are tightened | station | Internal to the machine |

### 2.7 Log and backups

| Setting | What it sets | Belongs to | Reason |
|---|---|---|---|
| `BRIGADE_BACKUP_DIR`, `BRIGADE_BACKUP_KEEP`, `BRIGADE_BACKUP_MAX_AGE_HOURS` | Where and how long the **log** is backed up | station | The log is the machine's |
| `BRIGADE_TRANSCRIPTS_KEEP_DAYS` | How long cook transcripts are kept | station | Disk of the machine |

(`BRIGADE_SUR_L_ISSUE` and `BRIGADE_SANDBOX_` in the code are internal markers, not settings.)

## 3. Other commands that write something

Gestures outside `station` that persist something. They are listed so that nothing written to the box is left out.

| Command | What it writes | Belongs to | Reason |
|---|---|---|---|
| `setting ceiling \| manager \| reviewer \| branch` | Proposes `projet.json` as a pull request | project | Already in the project's repository |
| `profile yes \| no <proposal>` | Writes a cook profile definition in the project's repository | project | Already in the project's repository |
| `installation stations …`, `installation decisions …` | The same stations and decisions as §1, at installation time | follows §1 | Same rows |
| `arbiter weight \| remove` | A project's weight on the machine | station | Shares one machine between projects |
| `guardrails stop \| resume \| pause`, `switch on \| off` | The live state of the kitchen (written to the log) | station | An operation on a running kitchen, not a setting |
| `grant … merge`, `rail`, `manager`, `closing`, `backup`, `restore`, `pull`, `door`, `phones` | Operations on tickets, backups, pairing | station | Operations, not settings |
