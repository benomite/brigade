# brigade — orchestrated multi-agent work

Four roles, four independent sessions, one GitHub backlog. The **PO** (`/brigade:po`) — which V2 calls **the second**: same role, same command — feeds the backlog with prioritized product issues; the **Designer** (`/brigade:designer`) handles the interface; the **orchestrator** (`/brigade:manager`) qualifies, spawns and integrates; the **dev-teammates** (`/brigade:dev`) implement. Isolation: **one git worktree per issue**, which the dev or the designer creates and manages themself, outside the repo's root directory.

> All coordination lives in **durable artifacts** — issues, labels, branches, PRs, the roadmap issue — never in a session's memory. That is what makes the system resilient: even if the orchestrator dies and takes its teammates with it, the committed and pushed work survives, and a new session rebuilds the state.

The plugin knows nothing about your project. What it cannot deduce, it reads in a **bindings block** that `/brigade:init` writes into your `CLAUDE.md`; what is procedural lives in **two scripts** of which the plugin knows only the contract. See "What the plugin expects from the project".

## Language

The code, the docs and the issues are in English. The dialogue with the agents stays in French. `docs/glossary.md` gives the English word for each object of the product.

## Installation

```bash
claude plugin marketplace add benomite/brigade
cd <your project> && claude plugin install brigade@brigade --scope project
```

The repo is **public**: `marketplace add` clones it over HTTPS, with no authentication or SSH key. The clone lands in `~/.claude/plugins/marketplaces/brigade/` — **that** is what `plugin install` and `plugin update` read, never the remote repo directly. Remember it exists: its state against `origin` is one of the three versions the roles compare, and a stale clone is what makes an out-of-date installation pass for "up to date".

Declaring the marketplace with `--scope project` writes it into the project's `.claude/settings.json`, next to `enabledPlugins` and the team setting: the repo then carries everything needed, and a `git clone` on another machine brings the complete declaration.

Then, in a session opened on the project: **`/brigade:init`**. The command deduces what it can (stack, package manager, test and build commands, file zones), asks for the rest in one pass, creates the labels and the roadmap issue, writes the bindings block and the two scripts, **then proves their contract** — it refuses to declare the project initialized if the gates or the worktree setup fail. It can be replayed: on an already bootstrapped project, it only does the difference.

### The Mac app

To follow your projects from an Apple Silicon Mac, the app installs from the `.dmg` published on the releases page, with no clone and no Node: see [`docs/installation-mac.md`](docs/installation-mac.md).

### Rolling out a plugin update

Nothing propagates by itself, and this is the costliest trap: `claude plugin update` compares the **declared version**. With an equal number it copies nothing, **even from a `directory` marketplace**, and `marketplace update` changes nothing about it. A project can therefore run for days on a frozen cache.

```bash
# 1. bump "version" in the plugin's .claude-plugin/plugin.json, then
claude plugin marketplace update brigade
cd <your project> && claude plugin update brigade@brigade --scope project
# 2. if the project has a Codex mirror:
#    /brigade:sync
```

**The roles now detect it themselves.** At its first status report, `/brigade:manager` compares the version installed on the project, the one of the marketplace cloned on the workstation, and the state of that clone against the remote repo; `/brigade:init` runs the same check before writing anything. All three values were needed: a stale clone makes an installation two versions behind pass for "up to date". What made this check necessary: on one workstation, the same day, three projects ran `0.7.0`, `0.8.0` and `0.9.0`, and the oldest one produced the permanent-dev-employee failure — two versions after the fix that would have prevented it.

The check **reports and stops; it does not update by itself**, for two reasons. Roles are loaded at session start: playing the update in the middle of a conversation changes nothing for that one, only for the next — the kind of false victory that makes a fix look rolled out. And a batch of devs in flight must not see its rules change along the way. The update is therefore done **cold**, then the session is restarted.

### One release, one command: `scripts/update-partout.sh`

Going around the projects by hand does not hold up: `claude plugin update` takes **one scope at a time**, has no `--all`, and its default scope is `user` — so forgetting `--scope` on a project installed in `project` updates nothing and says nothing. Worse, `claude plugin list` shows every installation of the workstation **without saying which project each belongs to**: three `brigade@brigade` at `0.7.0`, `0.8.0` and `0.9.0` look alike, and nothing says which one is the open project's.

```bash
scripts/update-partout.sh    # from anywhere, once per release
```

The script takes its orders from `~/.claude/plugins/installed_plugins.json`, the only file that carries the (project, scope) pair: it updates the marketplace, then each installation where it lives, skips those already at the right version, and reports vanished projects. No project forgotten because nobody remembered it.

**The alternative, if this round of the projects weighs on you: install in `user` scope** (`claude plugin update brigade@brigade` with no `--scope`, once for the whole workstation). The price is what the `project` scope bought: the repo no longer carries its installation, so a `git clone` on another machine — or a colleague — no longer brings the plugin, only its declaration. A real trade-off between "one command per release" and "the repo is self-contained"; the `project` scope stays the recommended default, the script absorbs its cost.

In every case, **restart the session**: the CLI says so itself, `restart required to apply`.

## Prerequisites and limits

- **Agent teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) — **a hard prerequisite of the orchestrator**, experimental and off by default. The orchestrator spawns its devs by giving a `name` to the `Agent` tool, and that parameter does not exist without this setting: without it, no teammate is created, no signal comes back. `/brigade:init` sets it in the **project's** `.claude/settings.json` — higher precedence than the user settings, and versioned, so the prerequisite follows the repo instead of depending on the workstation. `/brigade:manager` checks it before its first spawn and stops dead if it is missing.
  Do not check it with `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`: the harness exports the settings' `env` into the process, so the variable always looks active. Read the files, and respect their precedence — `managed > local > project > user`, a shell export last.
- **Interactive session required** for the orchestrator: in non-interactive mode (`-p`, SDK), no teammate is spawned, setting on or not. So there is no orchestration in cron or in CI. The other roles are used normally.
- **`/resume` does not restore teammates.** That is what makes recovery after an orchestrator crash necessary rather than defensive: on restart, it rebuilds the state from the artifacts and re-spawns the unfinished devs.
  A teammate is nonetheless **not** a thread of the orchestrator: it is a separate `claude` process, with its own process group and its own `--agent-id`. It is its **lifecycle** that is tied to the parent, not its memory space — and no execution mode changes that. Measured on 2026-10-05: with `teammateMode: "tmux"` and tmux installed, **no tmux session is created** (2 min 30 of polling), and the teammate dies with its parent exactly as before. No use looking for survival on that side — it is recovery from the artifacts that provides it.
- **No nested teams**: a teammate cannot spawn a teammate. The rule "only the orchestrator spawns" is a platform constraint before it is a governance choice.
- **Cost.** A team of agents consumes several times a simple session, and reasoning tokens are billed as output. Two settings and one rule decide the order of magnitude:
  - `subagentPromptCacheTtl: "1h"` — a teammate's requests leave the main conversation's cache bucket and fall back to a 5-minute TTL. A dev waits a lot (tests, CI, the orchestrator's reply), so its prefix expires between two turns and is rewritten. `/brigade:init` sets the setting in the project's `.claude/settings.json`; 1 h writes cost more each, and pay off from about ten turns.
  - `model` and `effort` **at spawn**, through the choice of agent — the `Agent` tool has no `effort` parameter, it comes from the frontmatter of the spawned agent. The plugin therefore exposes the same dev under three calibrations: `brigade:dev-teammate-low` (`sonnet`, `low`) for mechanical work, `brigade:dev-teammate-medium` for non-mechanical `fix`/`tech`, `brigade:dev-teammate` (session defaults) for features and the core of the product. The session default is a ceiling, not a starting point: without an explicit decision, a whole batch inherits the level of the most demanding role.
  - **One teammate = one issue.** This is the rule that weighs the most, and the only counter-intuitive one: see the permanent-dev-employee failure below.

## Roles

| Role | Activation | Does | Does NOT do |
|---|---|---|---|
| **PO** — "the second" | `/brigade:po` (one session) | **Reads the project's queue on opening** (what awaits the chef, and the action that unblocks it), brainstorms the product, digests user-test feedback, **writes the `product` issues** (Context + observable Acceptance criteria), **prioritizes** (`prio:` labels), keeps the product doc | Writes no application code (except UI copy/wording), does not touch the roadmap, does not qualify technically, does not merge, does not spawn |
| **Designer** | `/brigade:designer` (one session) | Handles the **interface**: loops with the declared design tool, implements the **skin** (CSS, rendering components, layout, local UI state), actively **has the human test**, delivers 1 PR | Does not touch business logic or the API (→ dev), does not merge (→ Manager), does not touch the roadmap, is never spawned by the Manager |
| **Orchestrator** | `/brigade:manager` (one session) | Qualifies and prioritizes (**applies the PO's `prio:` order**), **sole writer of the roadmap**, **spawns the dev-teammates**, supervises (idle + `SendMessage`), relays spec questions, **integrates full-auto** (gates → merge → push → close) — PRs from devs **and** from the Designer | Codes no feature itself; **never spawns a dev on a `design` issue** |
| **Dev-teammate** | `/brigade:dev <n>` | Implements ONE issue in ITS worktree, communicates through normalized signals, opens 1 PR | Never touches the integration branch or the roadmap, does not merge, never calls `AskUserQuestion` |

**PO and "second": one role, two names.** V1 says "PO"; V2 — the app's tab, [`docs/app.md`](docs/app.md), [`docs/runtime/`](docs/runtime/README.md), the spec — says "the second". It is the same session, launched by the same command, `/brigade:po`: there is nothing to leave to "switch to the second", and no new command to learn. What V2 changed fits in one line: it is not a new role, it is the same one, which now reads the project's queue on opening. The Manager is not in this case — in V1 a session you drive, in V2 a process of the runtime: there, they really are two things.

**The kitchen and the app: two things.** What works lives on the box, project by project, and runs without the app and without you: it is the project's **kitchen**, which `guardrails stop` stops — that project's, and only that one.
The app is the Mac's window: it reads, it displays, it writes commands into a terminal — closing it stops nothing on the box. Its overview screen is called **All projects**; `taken`, for its part, is the step of a ticket that a cook holds ([`docs/app.md`](docs/app.md), "The app is not the kitchen").

The flow goes one way: **PO → backlog → Manager → devs/designer → merge**. The PO feeds the upstream (the product "what"); the Designer takes the `design` issues in parallel with the devs; the orchestrator is not a frozen process, it **drains in an event-driven loop** — the *idle* notifications and the devs' signals wake it — as long as it has unblocked work. The dev role has **dual use**: spawned as a teammate by the orchestrator, or launched by hand by a human (autonomous mode, which serves as a fallback). The Designer is **always** human-driven.

## The two handoffs

Sessions are independent: they talk to each other **only through GitHub artifacts**.

**PO → Manager.** The **`product`** label means "born from the PO, to qualify first" (distinct from the `triage` "out of scope" created by a dev): the PO sets `product` + `triage`, the Manager qualifies and removes `triage`. The **`prio:1/2/3`** labels carry the order the PO wants; the Manager **sorts the roadmap by these labels** at every wake-up. The roadmap keeps a **single writer — the Manager** — but its **order is dictated by the PO**. Write boundary: the PO fills in the **what** (Context + observable Acceptance criteria), the Manager adds the **how** (file pointers, pitfalls, qualification, place in the roadmap). The PO never touches the roadmap.

**Designer ↔ Manager.** The **`design`** label means "strong visual component, the Designer's reserved ground": the Manager **never spawns a dev on it**. The Designer may create `design` issues; PO and Manager tag `design` whatever is visual. The scope varies — "pure skin" (Designer alone) or "skin + logic" (Designer for the visuals **plus** a dev for the logic, **sequenced** on disjoint file zones, the Manager partitions). The Designer opens a `Closes #N` PR that the Manager **discovers at its status report** (`gh pr list`) and integrates with the same gates as a dev PR. The Designer **has the human test before signaling `prêt`**.

**Runtime → PO.** On a project served by a runtime, the PO does not rebuild the project's state from GitHub: **when its session opens, with or without an argument, it reads the queue** — the box's action, `brigade <project> status` (from the workstation: `ssh <host> brigade <name> status` — see [`docs/runtime/`](docs/runtime/exploitation.md)), run once over `ssh` on the `hote` that `~/.config/brigade/app.json` declares for this folder, with the project's `nom` (the app's file, see [`docs/app.md`](docs/app.md)). It relays the `awaiting` block word for word, taken by its edge, action included; with no argument, the whole output. Nothing awaits: it is the block that says so, the PO never writes it itself. An output with no edge — a box not yet up to date — is reported as such and follows whole: it is not an empty queue. Queue not read — no runtime declared, box not reached, project the box does not know, command failing —: one line, each its own, with no diagnosis, and the briefing falls back to GitHub, saying so. Later in the session, it states the project's state only on a fresh read.

## The life of an issue

1. **Qualification** (Orchestrator) — `triage` issue → `feature`/`fix`/`tech` label (+ `design` if visual, hence no dev) + criteria + pointers + place in the roadmap, whose order follows the `prio:` labels.
2. **Assignment** (Orchestrator) — forms the batch, **partitions by file zone**, **spawns the `dev-<N>` of the parallel batch in a single message** (a pool of 2-3 in practice).
3. **Implementation** (Dev-teammate) — creates its isolated worktree, makes it runnable with the setup script, applies the project's loop skills. A `feature` issue sends its spec questions up **grouped** in one signal, never a product guess.
4. **Delivery** (Dev-teammate) — commits and pushes early, 1 PR, signal `prêt #N (PR <url>)`.
5. **Integration** (Orchestrator) — project gates + code review **scoped to the PR's diff**. **Green → merge, push, close, closing recorded as a roadmap comment, in full-auto.** Red → findings sent back to the dev. A neighboring scope becomes a **new issue**, never a reopening on a dev who has delivered. Then spawn of the next ready issue.

## Communication and autonomous draining

- A **teammate's plain text is invisible** to its parent: every report goes through `SendMessage`. Normalized signals: `question-spec #N`, `prêt #N (PR …)`, `bloqué #N`, `hors-scope #N`, and three refusals that protect the dev's context — `refus-réassignation #M`, `refus-lot #N (+#M…)`, `refus-extension #N`.
- **Spec questions do not block the pipeline**: they are left as an issue comment with the `blocked-on-human` label, and the orchestrator **keeps draining the rest**. It asks the user — grouped questions — only when it has no unblocked work left.
- **Drain loop**: at every *idle* or signal, the orchestrator integrates then spawns the next ready issue, until the backlog is empty or everything is blocked.
- **Resilience**: teammates are ephemeral, but worktrees, branches, commits, PRs, issues and roadmap survive. After a crash, a new `/brigade:manager` rebuilds the state and re-spawns the unfinished devs.

## Non-negotiable rules (learned the hard way)

- **One file, one owner** between concurrent worktrees. The orchestrator partitions by **zone touched**, not by logical independence — two logically independent issues that edit the same file must be sequenced.
- **The roadmap has a single writer: the orchestrator.** Two writers means guaranteed divergence.
- **The roadmap body carries the order, its comments carry the log.** A closing is recorded as a comment; the body is rewritten only when the order changes. A dated history accumulated in the body gets re-emitted at every merge, in *output* tokens, and its cost only grows with the project — measured at 72,861 characters, of which 17,122 were history alone, accumulated over four weeks of project.
- **A dev-teammate never merges and never calls `AskUserQuestion`**: it signals, the orchestrator arbitrates.
- **Sync discipline**: the dev rebases on the integration branch **at the start AND before opening its PR**. The orchestrator **pushes right after every merge** — never let the local branch drift from its `origin`.
- **Merge in dependency order. A parallel batch drains in one go** — its file zones being disjoint by construction, its PRs cannot conflict: they are merged one after another, then the gates are played once on the integration branch. Only two PRs that really overlap are serialized. Measured: 20 PRs out of 25 were waiting for another to be integrated, and a PR competing waited a median **43 min** against **11 min** when alone.
- **Merge gates**: the project's gates **plus** the code review, green. No merge on the strength of a claim: **proof by command output**. And the verdict is taken **where it is cheapest** — a CI that plays these same gates has already run on the PR's SHA: read it (`gh pr checks`) instead of replaying it. A gate the CI does not cover is an issue to open on the CI, not work to redo by hand at every merge.
- **Never let the human wait in silence.** Grouped questions left, or backlog entirely blocked: the orchestrator **notifies**. The longest tails measured in the protocol were not computation, but an answer waiting to be noticed.
- **Out-of-scope discovery** → the dev creates a raw `triage` issue, signals `hors-scope`, and **continues** its task. Never a silent scope extension.
- **A teammate lives for a single issue.** A new issue is given through a fresh `Agent`, never through `SendMessage` to a living dev. A dev who has delivered receives only the findings of **its** PR, then nothing more. It refuses any reassignment with the `refus-réassignation` signal.
- **Two sends back at most per PR.** At the third round trip, it is no longer the code that resists: merge with a follow-up issue, or escalate to the human.

### Four real failures this protocol prevents

They come from a real project, and each produced one of the rules above.

- **Duplicate** — two worktrees implemented the same issue in parallel. Hence: explicit assignment by the orchestrator, and one file / one owner.
- **Drift** — the local branch moved ahead by six commits never pushed, and the orchestrator kept reasoning on a state nobody else saw. Hence: immediate push after every merge.
- **Phagocytosis** — two devs worked in the **same root directory**; their commits got mixed on a single branch, one's spec and plan landed on the other's branch, whose own branch stayed empty. Hence: **one isolated worktree per issue, created by the dev itself**, never the root directory nor another's — and `git status` before each commit, which must show only the files of its issue.
- **Permanent dev employee** — the orchestrator kept three devs alive for twenty hours by handing them issue after issue through `SendMessage`: 7 spawns for 49 messages, up to 721 requests and ~250 k of context per request for a single dev. That dev read **177 M cache tokens**, against **6.8 M** for a comparable single-issue dev — a factor of 26, for the same work delivered. The inherited context is repaid at every turn of every following issue, and it crosses the 200 k threshold, which flips all the dev's requests to the long-context rate. The agent's name ended up lying: a teammate named `dev-117` was delivering issue #58. Hence: **one teammate = one issue**, a fresh dev per issue, and two sends back at most per PR. Reusing a living dev looks economical — a teammate's context is not an asset you capitalize, it is a rent you pay at every turn.

## What the plugin expects from the project

Three levels of coupling, and it is this split that makes the protocol portable.

**What is deduced** — repo, root, package manager, default branch — is computed by the roles. None of it is written anywhere.

**What is declared** lives in the `## Équipe multi-agents` section of your `CLAUDE.md` (the title stays in French: the roles look it up by that exact name), at the end of the file. As this file is already injected into every session, a role reads its bindings **with no tool call**. It holds the active roles, the roadmap issue, the worktrees location, the **integration branch** — the one worktrees start from and PRs target; if not declared, it is `main`, and a PR aiming at another one is not merged —, the **gates cap** if there is one (see below), the file zones (and which one is the Designer's skin), the living doc to sync on delivery, the spec and product-doc paths, the loop skills per role, and the project's pitfalls that no code lets you deduce.

**What is procedural** lives in two scripts of the project, of which the plugin knows only the contract:

- **`gates.sh [<worktree>]`** — the **verdict**. Its exit code *is* the verdict: `0` = green. It starts nothing; it judges.
  It also judges **its own duration**, if the project declares a cap: ``- **Plafond des gates** : `<n> s` de processeur`` in the bindings (the line stays in French: the script reads it). The cap is yours — ten seconds for a light suite, minutes for a heavy one — and nothing is capped as long as the line is missing. It is counted in **processor time**, not wall clock: several devs play their gates at the same time, and a wall-clock cap would first turn red from the machine's congestion. Processor time is the quantity that load deforms least — not one it spares. Measured on the plugin's repo (ten cores, same tree, one run at a time): 84 to 85 s of processor on a calm workstation, 95 to 103 s busy, 121 to 141 s saturated, while the wall clock goes from 16 to 132 s. **So set your figure on a measure taken when calm, plus a quarter.** Under heavy load it can turn red by itself, with no test added: the `durée des gates :` line carries, next to the total, the user / system split, the wall clock and the workstation's load — enough to recognize that red, which is replayed when calm before touching the suite or the figure. A `gates.sh` set by an earlier version of the plugin prints only the total: replay `/brigade:init`, which offers to replace that block alone and leaves the rest of the script and your figure. When crossed, the gates exit red and say by how much.
- **`worktree-setup.sh <n> <worktree>`** — the **bring-up**. It makes a worktree usable (dependencies, unversioned secrets, test database dedicated to the issue, ports) and prints **only `export` lines on stdout**, all noise going to stderr. Its exit code says whether the worktree is usable.

Keeping these two responsibilities separate is the point that matters: a script that brings up and judges at once gives a non-reproducible verdict. Corollary for the caller — **capture before evaluating**:

```bash
SETUP="$(worktree-setup.sh "$N" "$WT")" || { echo "setup failed" >&2; exit 1; }
eval "$SETUP"
```

In the form `eval "$(script)"`, `$?` is the `eval`'s: a setup that fails while printing nothing would pass for a success, and the dev would go coding in the void.

## Codex mirror

A project that also works with Codex keeps a mirror in `.agents/`, fed by **`/brigade:sync`**. The roles have **a single definition** — this plugin's commands; the mirror is only a projection of it.

- `.agents/skills/<role>/references/workflow.md` is a **copy** of the role's command. Not a symlink: the plugin cache path carries its version number, and a link would break at the first update, silently.
- `.agents/skills/<role>/SKILL.md` is a thin adaptation layer — read the shared workflow, translate the primitives specific to Claude Code. **No business rule is copied into it**: that would be a second truth, which would diverge at the first change.
- `AGENTS.md` is a symlink to `CLAUDE.md`: same repo, no version in the path, so the link is the right tool here.

The counterpart of the copy is that it must be resynchronized: **replay `/brigade:sync` after every plugin update.** A stale mirror signals itself by no error — Codex would simply hold yesterday's protocol.

## Conventions

- **Branches**: `feat/<n>-slug`, `fix/<n>-slug`, `tech/<n>-slug`, `design/<n>-slug`, where `<n>` is the issue number — that is what lets the orchestrator link branch, issue and PR.
- **PR**: body referencing `Closes #<n>`.
- **Labels**: `feature` / `fix` / `tech` (type, set by the Manager); `triage` (raw, to qualify); `product` (born from the PO); `design` (visual component, never a dev); `prio:1` / `prio:2` / `prio:3` (product priority, set by the PO); `blocked-on-human` (spec question pending).
- The rest of the code conventions belongs to your `CLAUDE.md`.

## License

[MIT](LICENSE).
