## Brigade's goal: autonomy

The kitchen serves its tickets on its own. **Every `blocked-on-human` without a product or design decision is a failure**, to be fixed like a bug, never a normal step. A TODO card asks a human a question: a product choice, a design choice, or a review only the chef can make. It is never something an agent can decide: a technical merge with a green CI, a rebase, a rerun, putting a ticket back on the rail. When in doubt, decide, say what you decided, and move on.

## Équipe multi-agents (plugin brigade)

The section title and the bold labels of the bindings below stay in French on purpose: `/brigade:init` and the roles look them up by these exact words. The content is English.

- **Language** : code, docs and issues are in English. The conversation with the chef is in French, and so is every dialogue with the agents. The word for each object is in `docs/glossary.md`.
- **Acteurs** : the chef, the second (local) and the kitchen (runtime, manager, cooks, pass)
- **Interface** : all interface work is carried by the kitchen's design cook (#837)
- **Branche d'intégration** : `main`
- **Worktrees** : `<parent of the repo>/brigade-wt/<n>-<slug>` — a sibling of the repo, the parent is computed (`dirname "$(git rev-parse --show-toplevel)"`)
- **Setup worktree** : `.claude/brigade/worktree-setup.sh <n> <WT>`
- **Gates** : `.claude/brigade/gates.sh <WT>`, then `/code-review`
- **Zones de fichiers** : three product zones, with different rules.
  - **Runtime** — `runtime/`: TypeScript run by Node 26, with its own `package.json`. A runtime issue writes here, and nowhere in the plugin zone.
  - **App** — `app/`: the desktop app (Electron, xterm.js, node-pty), TypeScript with no build, with its own `package.json`. An app issue writes here and adds **nothing** to the runtime: the app runs the commands that exist. `app/src/vue/` (the skin) is carried by the design cook (#837). The mockup is in `docs/maquettes/app/`; an app ticket names the screen it serves.
  - **Plugin V1** — `commands/` (roles), `agents/`, `codex/skills/` (Codex mirror, copied by `/brigade:sync`), `.claude-plugin/` (manifests). `evals/` holds the evaluation cases of these roles.
  - **Common** — `scripts/` (release tooling), `docs/`, `.claude/brigade/` (gates and worktree setup).
- **Dev local** :
  - **Runtime** — Node 26, no build. Tests: `npm --prefix runtime test` (they pass on a bare clone). Type check: `npm --prefix runtime run typecheck` (needs the dev dependencies, which the worktree setup installs). Start: `npm --prefix runtime start`. **Nine variables are required** (`BRIGADE_STATE_DIR`, `BRIGADE_PROJECT`, `BRIGADE_GITHUB_REPO`, `BRIGADE_REPO_DIR`, `BRIGADE_BASE_BRANCH`, `BRIGADE_MANAGER_MODEL`, `BRIGADE_MANAGER_EFFORT`, `BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT`): the setup sets only `BRIGADE_STATE_DIR`, and the runtime refuses to start, naming the one that is missing. **To read: the index `docs/runtime/README.md`, then only the pages of your part, and the section "On the dev workstation" of `docs/runtime/exploitation.md`.** **Started this way, it is a real kitchen: `start` launches real cooks on the Max quota, with no permission prompt.** The chef's commands run as `npm --prefix runtime run <command>` (the list in `runtime/package.json` is authoritative). No daemon runs on the dev workstation; the tests drive a fake `claude` (`BRIGADE_CLAUDE_BIN`) and use no quota.
  - **App** — Tests: `npm --prefix app test`; type check: `npm --prefix app run typecheck` — both need the dependencies, which the setup installs **without the Electron binary**, which no test launches. Start: `npm --prefix app start`. **Started this way, every space opened launches a real `claude` in the project folder** — to avoid the quota, use `BRIGADE_CLAUDE_BIN=app/test/aides/faux-claude.sh` and `BRIGADE_APP_CONFIG=<a trial file>`. **A project that declares `hote` is read by a real `ssh` every thirty seconds** — use `BRIGADE_SSH_BIN=<a fake ssh>`. **To read: the sections "For app developers" and the one of your screen in `docs/app.md`** (not the whole file).
  - **Plugin V1** — nothing to run. To try a modified role, bump `version` in `.claude-plugin/plugin.json`, then run `scripts/update-partout.sh`. The release path is in `scripts/README.md`.
  - **What the setup gives a worktree** — `BRIGADE_STATE_DIR=<WT>/.brigade-state` and `BRIGADE_PORT=20000 + <issue number>`. Never write a state path or a port by hand. The tests use neither: each creates its own temporary directory and listens on port 0.
- **Doc vivante** : `docs/` — every delivery that changes the behavior of a role updates the matching doc under `docs/`.
- **Specs / plans** : `docs/superpowers/specs/<YYYY-MM-DD>-<slug>.md`
- **Doc produit** : `README.md` — it describes the protocol as the user lives it (roles, handoffs, non-negotiable rules).

### Conventions of this repo

- **In the plugin zone, the Codex mirror is not optional.** Every change to a `commands/<role>.md` must be carried into `codex/skills/<role>/`; the gates turn red otherwise. They see that the mirror moved, not that it says the same thing. A change that only touches `runtime/` or `app/` owes nothing to the mirror.
- **The gates play the runtime tests, then the app's**, and the type check if declared. A change to a zone's code runs the type checks of both zones even when no test is close to it, as the CI's `types (<zone>)` checks do on every PR (#2549). They play only the tests the change touches, on the station as on the CI (#2565): the rule is in the header of `.claude/brigade/tests-touches.mjs`, `BRIGADE_GATES_TESTS=proches` plays only those close to it (dev workstation, while working), and `BRIGADE_GATES_TOUT=1` plays everything. A missing zone is not a failure. No network, no real `claude`, no screen: **no test launches Electron**; the view stays thin.
- **New runtime code is reached from where the station starts.** Every new export under `runtime/` has a caller chain up to `ouvrirStation` or `ouvrirCuisine` (`runtime/src/station/main.ts`), and a test that goes through it; data is read where production still writes it. An export only its tests call is a blocking review finding — the first send-back reason of the kitchen (#2770).
- **A test never races the clock**: several suites run at once and each takes three to four times as long. It waits for a fact (`jusqua`, a file written, a dead process).
- **The 2 s rule**: no test takes more than 2 s and no guard in a test exceeds 2 s (details in `docs/runtime/exploitation.md`). The gates refuse a slow test they play, but a guard over 2 s only through `runtime/test/garde-duree/garde-duree.test.ts`, which they play only when the change touches its own closure: a change that writes or raises a guard in a test (`jusqua(…, <ms>)`, a literal `timeout`, `delai`, `plafond` or `garde`) plays that file by hand — `cd runtime && node --test test/garde-duree/garde-duree.test.ts`. Otherwise only the Windows CI, which plays every file, sees it (#2832, #2846).
- **Never kill a process by its name** (`pkill -f src/main.ts`): you would fail another worktree's suite. Kill a stuck test by its pid. The gates' clock guard and the stuck-test rules are in `docs/runtime/exploitation.md`.
- **A runtime or app test failing in the gates is read without replaying**: its name and error are in the gates output, and the whole suite output is kept in `.brigade-state/gates/` of the worktree (one week).
- **An added role must be declared** in `commands` of `.claude-plugin/plugin.json`, or it never loads. The gates catch the omission.
- **A plugin update does not change the running session**: roles are loaded at startup.
