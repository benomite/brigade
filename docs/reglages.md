# The three levels of settings

Brigade has three places for a setting, and each setting lives at exactly one of them. The level
is written next to each setting in the app (`app/src/vue/niveaux.js`, ticket 1310), so you can see
where a value is kept before you change it. The three levels are named with the glossary words
([`glossary.md`](glossary.md), §7 — *level*): **project**, **this machine** and **you**.

| Level | Where it is kept | Who changes it, and how | Shared with the collaborators? |
|---|---|---|---|
| **project** | `.claude/brigade/projet.json`, in the project's repository | by a pull request, held for the chef | yes: everyone who clones the repository gets it |
| **this machine** | the station's configuration, on that machine | the chef, on that station (`brigade <projet> station`, or the app) | no: private to the station |
| **you** | `~/.config/brigade/app.json`, and a secret gist of the chef's GitHub account | the chef, in the app | no: it follows the chef, not the project |

**Nothing private goes in git.** Secrets, the paths of a machine, and what a machine decides for
itself (its cook count, its workspace folders, its capabilities, its sandbox) stay at their level. The
writer of `projet.json` refuses them (`runtime/src/reglages-projet/prive.ts`): a key whose name says a
secret or a machine setting, or a value shaped like a key or a path, is refused and the file is left
as it was.

## 1. Project settings — `.claude/brigade/projet.json`

The file is versioned with the code. Its fields:

| Field | Meaning | Values |
|---|---|---|
| `version` | the shape of the file; a file of a newer brigade is refused, not read half-way | `1` (required) |
| `integrationBranch` | the branch every worktree starts from and every PR aims at | the name of a git branch (required) |
| `defaultCalibrations` | the default model and effort of the manager and of the reviewer; keyed by role | `manager` and/or `reviewer`, each `{ "model", "effort" }` (optional) |
| `calibrationCeiling` | the ceiling of calibration for the whole project; it replaces the ceiling set on the box | `{ "model", "effort" }` (optional) |
| `closer` | the settings of the project's closer — the closing pass that writes ([`runtime/fermeture.md`](runtime/fermeture.md)); each one it sets replaces the box's | an object of the keys below, each optional (optional) |
| `drift`, `correction`, `profile`, `gates` | the project's thresholds and the gates' limits (#1672): what is too expensive or too drifted, when a correction repeats, when a cook profile is worth proposing, how long and how costly its gates and CI may be; each one it sets replaces the box's | objects of the keys below, each optional (optional) |
| `commonPaths` | the paths the rail treats as common to all tickets (#1673); it replaces the box's `BRIGADE_COMMON_PATHS` | a list of paths relative to the repository's root, no pattern, no comma (optional) |
| `rail`, `lessons` | the project's rail rule and notebook policy (#1673): the lease on a taken ticket, the roadmap issue the manager reads, and how many lessons a cook receives, when one is promoted or expires; each one it sets replaces the box's | objects of the keys below, each optional (optional) |

The `closer` keys, each one in place of a setting the box held (`brigade <projet> station <gesture>`):

| Key | Meaning | Values | In place of |
|---|---|---|---|
| `calibration` | the closer's model and effort; without one, from the file or the box, no closing pass writes | `{ "model", "effort" }` | `closer-modele`, `closer-effort` |
| `cooksBelow` | the start condition: the pass leaves when fewer cooks than this are in flight | an integer greater than zero (default 1: none in flight) | `closer-cooks` |
| `maxTokens` | the tokens cap of one pass | an integer greater than zero (default 500,000) | `closer-tokens` |
| `maxRemovedLines` | the cap on the lines one pass may remove | an integer greater than zero (default 500) | `closer-retraits` |

The thresholds, each one in place of a variable of the box (the four cost ones also of a gesture of `brigade <projet> station`):

| Key | Meaning | Values | In place of |
|---|---|---|---|
| `drift.ticketTokens` | tokens of the most expensive ticket | integer > 0 | `seuil-ticket` |
| `drift.lostTokens` | lost tokens | integer > 0 | `seuil-perdus` |
| `drift.firstTryPercent` | share of tickets delivered first try, in % | number > 0 | `seuil-renvois` |
| `drift.firstTryWindow` | window of that threshold, in tickets | integer > 0 | `fenetre-renvois` |
| `drift.contextKb` | size of the context a cook receives, in KB | number > 0 | `BRIGADE_DRIFT_CONTEXT_KB` |
| `drift.gatesSeconds` | duration of the gates, in seconds | number > 0 | `BRIGADE_DRIFT_GATES_SECONDS` |
| `drift.growthPercent` | growth of the project's measures, in % | number > 0 | `BRIGADE_DRIFT_GROWTH_PERCENT` |
| `drift.merges` | merges per reading | integer > 0 | `BRIGADE_DRIFT_MERGES` |
| `drift.repoMb` | size of the repository, in MB | number > 0 | `BRIGADE_DRIFT_REPO_MB` |
| `drift.tests` | number of tests | integer > 0 | `BRIGADE_DRIFT_TESTS` |
| `drift.testsSeconds` | duration of the tests, in seconds | number > 0 | `BRIGADE_DRIFT_TESTS_SECONDS` |
| `correction.threshold` | repeated corrections that raise a proposal | integer ≥ 2 | `BRIGADE_CORRECTION_THRESHOLD` |
| `correction.window` | window, in tickets, in which corrections are counted | integer > 0 | `BRIGADE_CORRECTION_WINDOW` |
| `profile.window` | window, in tickets, a cook profile is computed from | integer > 0 | `BRIGADE_PROFILE_WINDOW` |
| `profile.minTickets` | tickets needed in that window before a profile is proposed | integer > 0 | `BRIGADE_PROFILE_MIN_TICKETS` |
| `profile.gapPoints` | gap, in points, that makes a profile worth proposing | number > 0, 100 at most | `BRIGADE_PROFILE_GAP_POINTS` |
| `gates.durationBudgetSeconds` | wall-clock budget of one gates run | integer > 0 | `budget-gates` (`BRIGADE_GATES_BUDGET_SECONDS`) |
| `gates.processorBudgetSeconds` | processor budget of one gates run | integer > 0 | `budget-gates-cpu` |
| `gates.baseDurationBudgetSeconds` | wall-clock budget of the full run on the base | integer > 0 | `budget-base` |
| `gates.baseProcessorBudgetSeconds` | processor budget of the full run on the base | integer > 0 | `budget-base-cpu` |
| `gates.timeoutSeconds` | how long the pass waits for the gates before stopping them | integer > 0 | `BRIGADE_GATES_TIMEOUT_SECONDS` |
| `gates.ciWaitSeconds` | how long the pass waits for a CI that does not conclude | integer > 0 | `BRIGADE_CI_WAIT_SECONDS` |
| `rail.leaseSeconds` | the lease on a taken ticket, in seconds (default 1800) | integer > 0 | `BRIGADE_LEASE_SECONDS` |
| `rail.roadmapIssue` | the number of the roadmap issue the manager reads | integer > 0 | `BRIGADE_ROADMAP_ISSUE` |
| `lessons.injected` | how many provisional lessons a cook receives (default 20; 0: none) | integer ≥ 0 | `BRIGADE_INJECTED_LESSONS` |
| `lessons.promotionRetros` | independent retros needed before a lesson is promoted (default 3) | integer > 0 | `BRIGADE_PROMOTION_RETROS` |
| `lessons.provisionalExpiryTickets` | tickets after which a provisional lesson expires (default 20) | integer > 0 | `BRIGADE_PROVISIONAL_EXPIRY_TICKETS` |
| `lessons.promotedExpiryTickets` | tickets after which a promoted lesson expires (default 20) | integer > 0 | `BRIGADE_PROMOTED_EXPIRY_TICKETS` |
| `lessons.sendbackPromotionGap` | the gap a send-back or a chef's correction takes off the retros needed (default 1; 0: none) | integer ≥ 0 | `BRIGADE_SENDBACK_PROMOTION_GAP` |

These names are the project's settings, not what the writer's sieve looks for: `closer.cooksBelow`
is not a machine's cook count, `closer.maxTokens` is not a token. Elsewhere in the file, the same
names are still refused.

A calibration is `{ "model": "opus" | "sonnet" | "haiku", "effort": "low" | "medium" | "high" | "xhigh" | "max" }`.
Both keys are needed: a model alone is refused. Any other key is refused, with its name.

Example:

```json
{
  "version": 1,
  "integrationBranch": "v2",
  "defaultCalibrations": {
    "manager": { "model": "sonnet", "effort": "medium" }
  },
  "calibrationCeiling": { "model": "opus", "effort": "high" },
  "closer": {
    "calibration": { "model": "sonnet", "effort": "medium" },
    "maxTokens": 300000
  }
}
```

The file is written in one fixed form (two spaces, keys in this order), so the same settings give
the same bytes. Edit it by hand only if you know this form; otherwise change it from the app — the
project's page, Settings, `Project settings`, one row per setting above, the closer's included
([`app.md`](app.md), "The project's settings, changed by a pull request") — or propose the change
with `brigade <projet> setting` (see [`runtime/exploitation.md`](runtime/exploitation.md), "setting").
Both open the pull request, and neither sets anything on the box. A value the file would refuse is
refused before any pull request, by the same check as the file's, in one sentence.

### How a collaborator gets them

Cloning the repository is enough: the file comes with it. The station does not read the working
tree of its clone for these settings. It reads the file on `origin/<integrationBranch>`, as the
last fetch saw it, and it rereads it at each use. So a pull request merged into the integration
branch takes effect at the next fetch, with no restart and no `sudo`.

### Fallbacks

- **The integration branch** is taken in this order: `projet.json` on the branch the station's line
  names; then `projet.json` in the clone's working tree; then the station's line (a station's
  configuration may name no branch); then the `Branche d'intégration` line of the clone's `CLAUDE.md`.
  The first one that answers wins, and the station says where it came from.
- **The calibrations of the manager and the reviewer**: without the file, or without the role in it,
  the values the box sets for that project apply (`BRIGADE_MANAGER_MODEL`, `BRIGADE_MANAGER_EFFORT`,
  `BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT`, see [`runtime/exploitation.md`](runtime/exploitation.md)).
- **The ceiling of calibration**: without `calibrationCeiling`, the box's `BRIGADE_CEILING_MODEL` and
  `BRIGADE_CEILING_EFFORT` apply; without them, the runtime's default (`opus` / `high`).
- **The closer's settings**, one by one: a key of `closer` the file leaves out is the box's decision
  (`closer-modele`, `closer-effort`, `closer-cooks`, `closer-tokens`, `closer-retraits`), and without
  one, the runtime's default — the calibration has none. `brigade <projet> station` says, on each of
  these rows and under **closer in force**, whether the value comes from the repository, from the box
  or from the default; `brigade <projet> closing --json` says the same in `closer.from`.
- **The thresholds**, one by one: a key of `drift`, `correction`, `profile` or `gates` the file leaves out is the
  box's (the gesture's decision, else the variable of the station's line), and without one, the runtime's
  default. A box whose project has no file keeps its gestures (`seuil-ticket`, `seuil-perdus`,
  `seuil-renvois`, `fenetre-renvois`) and its variables exactly as before; while the file sets a key,
  the gesture's decision is ignored, and `station` says so. The four budgets of `gates` are reread at
  each use, and the `budget-*` gestures keep working on a box with no file; `gates.timeoutSeconds` and
  `gates.ciWaitSeconds` are read when the kitchen opens, so a change reaches them at the station's next
  start.
- **The rail and the notebook** (`rail`, `lessons`, `commonPaths`, #1673): the same rule, one by one — a key
  the file sets wins over the box's variable, which wins over the runtime's default. They are read when
  the kitchen opens, so a change reaches them at the station's next start. A box whose project has no
  file keeps its variables exactly as before.
- **A file that is not project settings** (unknown key, wrong value, a secret in it) is **refused**:
  the kitchen does not open, and it says why. It does not fall back to the box's values, which the
  file would replace.

## 2. This machine — the station's settings

Each station keeps its own settings, in its configuration line. They are not in git and no other
machine reads them. What a station decides for itself:

- **its cook cap** — how many cooks it runs at once (`cooks <N>`, or `cooks auto`);
- **its capabilities** — what the machine knows how to do (`code`, `navigateur-headless`…), and whether
  it takes the ordinary tickets (`ordinaires`, `ensemble`) — see [`runtime/station-machine.md`](runtime/station-machine.md);
- **its folders** — where it puts its clones and its worktrees (`BRIGADE_STATION_DIR` on a server);
- **its projects** — one line per project it serves, and whether this station is the project's main one.

These are the settings the writer of `projet.json` refuses: a project's file never carries them.

## 3. You — the app's preferences

The app keeps its own preferences in `~/.config/brigade/app.json`, outside any repository, and in
a **secret gist of your GitHub account**. Every `you` setting is one of two kinds, and the split is
the list of device-bound keys in `app/src/reglages-perso/partage.ts`: a key on that list stays on
the machine it was set on; any other key of the file is a preference, and follows you from one
device to another — including one added later, with no change to this page. The app draws the
colors and writes them itself; see [`app.md`](app.md), "A project's colors" and "Your preferences
follow you from one device to another".

**Follows you** (the gist, then `app.json` on each device):

| Setting | Key in `app.json` | Note |
|---|---|---|
| The colors of a project (tab and accent) | `projets[].couleurs` | the only `you` setting the Settings screen shows (`app/src/vue/niveaux.js`) |
| The order of your projects in the bar | the order of `projets` | set by arranging the bar; the order of two devices is merged, not overwritten |
| Display preferences | none yet | the app has none today (no theme, density or font size); one added later follows you by default |
| Any other personal key | any key not listed below | follows you by default |

**Stays on this device** (never in the gist; each device keeps its own):

| Setting | Key in `app.json` | Why it stays |
|---|---|---|
| A project's folder on this machine | `projets[].dossier` | a path that exists on this machine only |
| Ordinary tickets and the cook limit of this machine's station | `projets[].ordinaires`, `projets[].limiteCooks` | decisions this machine makes for itself (§2) |

The app no longer reads or writes any key naming an ssh host, a list of boxes or the stations this machine plays: a file
written by an older version that still carries them is read without error, and those keys are ignored.

**A collaborator never sees your preferences.** Someone who shares a project and clones its
repository runs the app with their own `app.json` and reads their own gist: your colors, your order
and your gist never reach them, and nothing of yours reaches the project's repository.
**`projet.json` is not affected**: nothing in this section reads or writes it. The project's shared
settings stay in §1, and change by a pull request.

## 4. Moving the box's settings into the repository — the migration

The settings that the box held for a project before `projet.json` existed (the integration branch,
the manager and reviewer calibrations, the ceiling) move into the project's repository once, with
the migration script. Its README is [`scripts/migration-reglages-projet/README.md`](../scripts/migration-reglages-projet/README.md).

The chef runs it **on the box**, from the brigade checkout:

```sh
# Dry run (the default): per project, the target repository and the proposed file. Changes nothing.
node scripts/migration-reglages-projet/migrer.ts --config projets.json

# For real: one pull request per project that has a difference.
node scripts/migration-reglages-projet/migrer.ts --config projets.json --apply
```

A project whose integration branch already has the file is skipped. The pull request is merged by the
chef; until then, the box keeps its own settings.
