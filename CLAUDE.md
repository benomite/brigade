## Brigade's goal: autonomy

The kitchen serves its tickets on its own. **Every `chef-todo` without a product or design decision is a failure**, to be fixed like a bug, never a normal step. A TODO card asks a human a question: a product choice, a design choice, or a review only the chef can make. It is never something an agent can decide: a technical merge with a green CI, a rebase, a rerun, putting a ticket back on the rail. When in doubt, decide, say what you decided, and move on.

## Brigade's goal: security

**No agent ever combines the three legs of the lethal trifecta**: private data, untrusted content, and a way to send data out. Every cook is isolated to its own project and behind its network filter; only text from trusted authors (the chef, write collaborators, the kitchen's agents) reaches an agent; without its safeguards, the kitchen cooks nothing. **A change that reopens a leg is refused** (a safeguard switch, a new outside source, a new way out).

## Équipe multi-agents (plugin brigade)

The section title and the bold labels of the bindings below stay in French on purpose: `/brigade:init` and the roles look them up by these exact words. The content is English.

- **Language** : code, docs and issues are in English. The conversation with the chef is in French, and so is every dialogue with the agents. The word for each object is in `docs/glossary.md`.
- **Acteurs** : the chef, the second (local) and the kitchen (runtime, manager, cooks, pass)
- **Interface** : the project declares its tools (screenshots come from `scripts/capture-ecran/`), and a ticket states the tools it needs
- **Branche d'intégration** : `main`
- **Worktrees** : `<parent of the repo>/brigade-wt/<n>-<slug>` — a sibling of the repo, the parent is computed (`dirname "$(git rev-parse --show-toplevel)"`)
- **Setup worktree** : `.claude/brigade/worktree-setup.sh <n> <WT>`
- **Gates** : `.claude/brigade/gates.sh <WT>`, then `/code-review`
- **Zones de fichiers** : three product zones, with different rules.
  - **Runtime** — `runtime/`: TypeScript run by Node 26, with its own `package.json`. A runtime issue writes here, and nowhere in the plugin zone.
  - **App** — `app/`: the desktop app (Electron, xterm.js, node-pty), TypeScript with no build, with its own `package.json`. An app issue writes here and adds **nothing** to the runtime: the app runs the commands that exist. `app/src/vue/` (the skin) is interface work: its ticket states the tools it needs (screenshots, via the project tool list). The mockup is in `docs/maquettes/app/`; an app ticket names the screen it serves.
  - **Plugin V1** — `commands/` (roles), `agents/`, `codex/skills/` (Codex mirror, copied by `/brigade:sync`), `.claude-plugin/` (manifests). `evals/` holds the evaluation cases of these roles.
  - **Common** — `scripts/` (release tooling), `docs/`, `.claude/brigade/` (gates and worktree setup).
- **Dev local** :
  - **Runtime** — Node 26, no build. Tests: the gates (`.claude/brigade/gates.sh <WT>`), never a whole suite (the CI runs it). Type check: `npm --prefix runtime run typecheck` (the setup installs its dependencies). Start: `BRIGADE_STATION_DIR=<a folder> npm --prefix runtime start` runs the kitchen (`runtime/src/kitchen/main.ts`) on the projects of `<folder>/kitchen/projects`. **To read: `docs/runtime/README.md`, then only your part's page.** **Started this way, it is a real kitchen: `start` launches real cooks on the Max quota, with no permission prompt.** The tests drive a fake `claude` (`BRIGADE_CLAUDE_BIN`) and use no quota.
  - **App** — Tests: the gates, never a whole suite (CI: `npm --prefix app test`); type check: `npm --prefix app run typecheck` — the setup installs their dependencies, **without the Electron binary**. Start: `npm --prefix app start`. **Started this way, every space opened launches a real `claude` in the project folder** — to avoid the quota, use `BRIGADE_CLAUDE_BIN=app/test/helpers/fake-claude.sh` and `BRIGADE_APP_CONFIG=<a trial file>`. **A project that declares `hote` is read by a real `ssh` every thirty seconds** — use `BRIGADE_SSH_BIN=<a fake ssh>`. **To read: the sections "For app developers" and the one of your screen in `docs/app.md`** (not the whole file).
  - **Plugin V1** — nothing to run. To try a modified role, bump `version` in `.claude-plugin/plugin.json`, then run `scripts/update-partout.sh`. The release path is in `scripts/README.md`.
  - **What the setup gives a worktree** — `BRIGADE_STATE_DIR=<WT>/.brigade-state` and `BRIGADE_PORT=20000 + <issue number>`. Never write a state path or a port by hand. The tests use neither: each creates its own temporary directory and listens on port 0.
- **Doc vivante** : `docs/` — every delivery that changes the behavior of a role updates the matching doc under `docs/`.
- **Specs / plans** : `docs/superpowers/specs/<YYYY-MM-DD>-<slug>.md`
- **Doc produit** : `README.md` — it describes the protocol as the user lives it (roles, handoffs, non-negotiable rules).

### Conventions of this repo

- **Zone rules** live in the zone's doc. Runtime: `docs/runtime/README.md` § "Rules of this repo". App: `docs/app.md` § "For app developers".
- **The gates check the other rules**: a red names the rule.
- **A criterion is served in every place it covers**: list each message, screen, command, path and doc it names, serve each, and write the list in the report.
- **A plugin update does not change the running session**: roles load at startup.

## Self-supervision freeze (epic #3904)

A **self-supervision ticket** makes the kitchen watch, repair, detect or file tickets about itself. While #3904 is open, it goes on the rail only if its PR diff on `runtime/src` deletes more lines than it adds (`git diff --numstat origin/main...HEAD -- runtime/src`, summed).
