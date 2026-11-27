# The runtime: the kitchen

The runtime is one program, the **kitchen** (`runtime/src/kitchen/main.ts`). One loop serves every project of a
station: at each turn it reads GitHub, decides, and launches agents — cook, pass, manager, supervisor — whose
instructions are prompts (`agents/kitchen/`). It lives in `runtime/`, runs on Node 26 with no build and no run-time
dependency. Design and reasons: [`2026-11-26-agents-in-prompts.md`](../superpowers/specs/2026-11-26-agents-in-prompts.md).

**Open this page first, then only the page of your part.**

| Page | What it holds |
|---|---|
| [`mac-new-kitchen.md`](mac-new-kitchen.md) | The kitchen on a Mac: declaring a project, what Claude Code's sandbox needs, what happens without it |
| [`bac-a-sable.md`](bac-a-sable.md) | What an agent may do on the network, on Linux (`bwrap`) and on macOS (Claude Code's sandbox) |
| [`isolation-and-network-filter.md`](isolation-and-network-filter.md) | The rule: isolation and the network filter on every station, and the lethal trifecta reason |

## What runs

| File | What it does |
|---|---|
| `kitchen/main.ts` | The entry point: reads `<BRIGADE_STATION_DIR>/kitchen/projects` at every turn and runs one turn per project |
| `kitchen/kitchen.ts` | One turn of a project: reads what finished agents left, reads GitHub, decides, acts (merge, try count, places, risk zones) |
| `kitchen/decide.ts` | The whole policy as one pure function: from GitHub's state and the running agents, the gestures of the turn |
| `kitchen/github.ts` | What the kitchen reads and writes on GitHub, through `gh` |
| `kitchen/agents.ts` | The agents' prompts and what their answers ask for |
| `kitchen/runs.ts` | Each agent run is a folder under the project's state, launched through the relay (`relais.ts`): it outlives the kitchen, and a restarted kitchen finds it again |
| `kitchen/projects.ts` | The projects file |

`runtime/src/kitchen/` stays under 1,000 lines (`runtime/test/kitchen/kitchen.test.ts` counts them): a safeguard
the kitchen needs lives in its own module (`bac-a-sable/kitchen-launch.ts`, `bac-a-sable/kitchen-sandbox.ts`,
`porte-journal.ts`), and the kitchen only calls it.

The rest of `runtime/src` is only what the kitchen imports, directly or not, and the few programs a station or a
tool launches beside it:

| Entry point | Launched by |
|---|---|
| `relais.ts`, `moteur/codex-en-flux.ts` | the kitchen, for each agent |
| `station/tenir-portes.ts` | `brigade-station-porte.service`: the station's network gates |
| `mise-a-jour/main.ts` | `brigade-station-mise-a-jour.timer`: the station's update |
| `connexion-max/connecter-cli.ts` | `installer-station.sh`, under Linux: the Max connection of the station's account |
| `reseau-cli.ts`, `bac-a-sable/detection-projet.ts`, `essai-projet/declaration-cli.ts` | by hand, from the project folder: they write `.claude/brigade/reseau`, `.claude/brigade/bac-a-sable.json` and `.brigade/try.json` when absent |
| `second-init/pr-de-setup.ts` | the repository setup, in the session the app opens in the second (`app/src/setup/instructions.md`) |
| `fermeture-alerte-publication.ts` | `.github/workflows/publier-app.yml`: closes the alerts of a release once it is published |
| `station/geste.ts` | the app (`ACTION`, `app/src/box.ts`): `node src/station/geste.ts <project> <command> [arguments…]`, run from `runtime/` with `BRIGADE_STATION_DIR` |
| the scripts of `runtime/package.json` but `start`, `test` and `typecheck` | `station/geste.ts`, which runs the file its command's script names |

The commands behind the gesture are the ones the app launches, and only those: `facts`, `log`, `station`, `setting`,
`humans`, `contributor-stations`, `manager`, `installation`, `agents`, and
`help`, which lists them (`commandes.ts`). `app/test/geste-serves-every-command.test.ts` collects what the app
launches and runs each one through the real `geste.ts`: a command dropped while the app still launches it fails there.

## Declaring a project

One line per project in `<BRIGADE_STATION_DIR>/kitchen/projects`, read again at every turn — no restart:

```
<name> <owner/repo> <base> [PLACES=<n>] [CLONE=<path>]
```

- `PLACES` is the number of cooks at once (4 by default).
- `CLONE` points at an existing clone; without it, the clone is `<BRIGADE_STATION_DIR>/<name>/depot`.
- The project's state, its agents' runs and their worktrees go to `<BRIGADE_STATION_DIR>/kitchen/<name>/`.
- A closed or merged ticket keeps no worktree: the kitchen sweeps `worktrees/` every ten minutes and removes those of closed tickets (not one in the kitchen, not one it cannot read). The station unit has a private `/tmp` (`PrivateTmp=yes`), emptied when the unit stops, and each package update restarts it.

What the project's base branch declares, read before each turn:

- `.brigade/kitchen.json` — its risk zones, `{"risk": ["runtime/"]}`: a pull request that touches one waits for the
  chef's merge;
- `.claude/brigade/reseau` — its network allowlist, one host per line (see [`bac-a-sable.md`](bac-a-sable.md)). The
  kitchen publishes it to `<BRIGADE_STATION_DIR>/kitchen/<name>/network.json`, where the station's gate reads it.

## On GitHub

The kitchen keeps no memory: a restarted kitchen reads the same state and decides the same thing. A ticket's state
is its labels: `fire` (ready), `taken` (a cook works on it), `in-pass` (its pull request is judged), `parked` and
`parked:chef` (it waits; `approved` beside `parked:chef` means the pass approved its pull request, which waits for the
chef's merge), `try:<n>` (the number of cooks that tried it, three at most), `prio:<n>`, and `idea`, `epic`, `human`
(never taken). A ticket waits for the open tickets its body names with `Depends on #N`. Only tickets from the
repository's writers, or labelled `accepted` by one, are taken.

## Where it runs

| Station | What starts the kitchen |
|---|---|
| A Linux server (the box) | The Debian package `brigade-station` ([`runtime/paquet/`](../../runtime/paquet/README.md)): `brigade-station.service` runs `src/kitchen/main.ts` with `BRIGADE_STATION_DIR=/var/lib/brigade`, agents in `bwrap`, the unit reaching only localhost; `brigade-station-porte.service` holds the gates, its only way out. Installed by `installer-station.sh` ([`docs/installation-station.md`](../installation-station.md)) |
| A Mac | The app, which runs it as this computer's station (`PRINCIPAL`, `app/src/workstation/role.ts`), or the launchd agent `installer-station.sh` writes. Agents run in Claude Code's sandbox: [`mac-new-kitchen.md`](mac-new-kitchen.md) |
| Windows | `installer-station.ps1` starts it. No sandbox is available there: the kitchen launches no agent, and says why in the station's log |

Once started, the kitchen writes `<BRIGADE_STATION_DIR>/en-service` (its version, its pid, since when, the projects
it serves) and rewrites it when that changes: the station's update keeps a new version only when the kitchen says it
is in service on it, and the app reads it too. Stopping the kitchen stops no agent: each one finishes under its relay,
and the next kitchen takes it back (`KillMode=process`).

The box's update: every ten minutes `brigade-station-mise-a-jour.timer` installs the latest `station-<version>`
release; if the kitchen does not say it is in service on it within two minutes, or serves fewer projects than before,
the previous package comes back. `gel=oui` in `/var/lib/brigade/reglages` freezes the version.

## Variables

| Variable | Default | What it sets |
|---|---|---|
| `BRIGADE_STATION_DIR` | required | The station's folder: `kitchen/projects`, each project's state, `en-service` |
| `BRIGADE_KITCHEN_TURN_SECONDS` | `60` | Time between two turns |
| `BRIGADE_CLAUDE_BIN` | `claude` | The `claude` the agents run (the tests give a fake one) |
| `BRIGADE_GH_BIN` | `gh` | The `gh` the kitchen runs |
| `BRIGADE_STATION_PORTES` | none | The gates' ports file: the kitchen and each project go out through their gate |
| `BRIGADE_SANDBOX_BIN`, `BRIGADE_SANDBOX_HIDDEN` | none | `bwrap`, and the folders it hides from agents (Linux) |
| `GH_TOKEN`, `GITHUB_TOKEN` | none | The kitchen's own GitHub token; never given to an agent |

## On the dev workstation

```bash
eval "$(.claude/brigade/worktree-setup.sh <n> "$PWD")"
mkdir -p "$BRIGADE_STATE_DIR/kitchen"
echo "brigade benomite/brigade main CLONE=<a clone reserved for this trial>" > "$BRIGADE_STATE_DIR/kitchen/projects"
BRIGADE_STATION_DIR="$BRIGADE_STATE_DIR" npm --prefix runtime start   # Ctrl-C to stop it
```

**Started this way, it is a real kitchen.** It reads the repository's real issues with your `gh`; a ticket carrying
`fire` launches a real cook on your Max quota, with no permission prompt, which pushes its branch and opens a pull
request; the pass judges it and merges what it approves. The tests drive a fake `claude` (`BRIGADE_CLAUDE_BIN`) and a
fake `gh` (`BRIGADE_GH_BIN`), and use no quota.

## Rules of this repo

They hold for the runtime, and for the app's tests where they name tests. The gates (`.claude/brigade/gates.sh`)
check some of them, and their `FAIL` line names the rule; they judge only the files the change touches.

- **What the gates play.** The runtime tests, then the app's, and the type check if declared. A change to a zone's
  code runs the type checks of both zones. `BRIGADE_GATES_TESTS=proches` plays only the tests close to the change
  (dev workstation, while working), and `BRIGADE_GATES_TOUT=1` plays everything. No network, no real `claude`, no
  screen.
- **New runtime code is reached from where the station starts**: every new export under `runtime/src` has a caller
  chain up to `kitchen/main.ts` (`openKitchen`) or one of the entry points above, and a test that goes through it. An
  export only its tests call is a blocking review finding.
- **A test never races the clock**: several suites run at once and each takes three to four times as long. It waits
  for a fact (`jusqua`, a file written, a dead process).
- **The 2 s rule**: a test or a guard over 2 s fails, unless it is listed in `runtime/test/garde-duree/exceptions.ts`.
  While working, after writing or raising a guard (`jusqua(…, <ms>)`, a literal `timeout`, `delai`, `plafond` or
  `garde`), play `cd runtime && node --test test/garde-duree/garde-duree.test.ts`.
- **The tests that guard a whole folder are never close to a diff** (`architecture.test.ts`, `sans-invite.test.ts`,
  `garde-duree/garde-duree.test.ts`): a change that adds a module under `runtime/src`, an import of
  `node:child_process` or a network call plays them by hand.
- **A test's `git` runs under `ENV_GIT`** (`runtime/test/outils.ts`), and so does every child it launches that runs
  `git`: `env: { ...ENV_GIT, … }`, never `process.env`. The CI runner gives `git` no identity.
- **No process launched by a station asks a question.** Every process the runtime launches goes through
  `runtime/src/sans-invite.ts` (`GIT_TERMINAL_PROMPT=0`, a failing askpass, `GH_PROMPT_DISABLED=1`, `ssh -o
  BatchMode=yes`). A module that imports `node:child_process` directly fails `test/sans-invite.test.ts`.
- **A conflict with the base is resolved by the ticket's cook**, in its own branch: it merges the base, resolves the
  conflicts and commits the merge. A conflict is never handed to a new ticket.
