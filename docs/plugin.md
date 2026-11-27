# The brigade plugin for Claude Code

The repository is also a Claude Code marketplace, `brigade`, that publishes one plugin, `brigade`, from `main`
(#4525). It is the way into brigade from a Claude Code session: it says what brigade is, checks what the kitchen
needs, and sends you to the app. The kitchen itself runs from the app; the plugin does not cook.

## Install

```
/plugin marketplace add benomite/brigade
/plugin install brigade@brigade
```

On Claude Code 2.1.275 or later, one line does both: `/plugin install brigade --marketplace benomite/brigade`.
A session already open keeps the commands it started with: Claude Code loads plugins at startup.

The V1 plugin (the `/brigade:po`, `/brigade:manager`, `/brigade:dev` and `/brigade:designer` roles) is no longer
published from `main`. It stays installable from the tag `v1-final`:
`/plugin marketplace add benomite/brigade@v1-final`, then `/plugin install brigade@brigade`.

## Its two commands

- **`/brigade:start`** (`commands/start.md`): what brigade is in five lines (the **rail**, the **cook**, the
  **pass**, the **second**); whether `gh` is installed and logged in; the repository you are in (`owner/repo`, its
  default branch, whether you can push, whether brigade already knows it); and the app download for your
  computer — the file of the newest `app-v*` release for macOS on Apple silicon, Linux x64 or Windows x64, or the
  releases page when `gh` cannot read them. It only reads: its allowed tools are `gh --version`,
  `gh auth status`, `gh repo view`, `gh release list|view`, `git rev-parse`, `git remote` and `uname`.
- **`/brigade:ask <number> [question]`** (`commands/ask.md`): where a ticket stands and what it waits for, or the
  answer to your question about it, from what GitHub says. It only reads.

Both are written in English and answer in your language. `/brigade:ask` has a Codex mirror,
`codex/skills/ask/`, that carries the same text (the gates check it).

The manifest declares these two files and an empty `agents` list. Both keys are needed: when a manifest does not
name `commands` or `agents`, Claude Code loads every `.md` of the plugin's `commands/` or `agents/` folder, and
those folders still hold the V1 files (below).

## Beside the app's plugin

The app installs its own plugin in every project it opens (`app/src/plugin-app.ts`, see "`/brigade:dev`,
`/brigade:ask` and `/brigade:init` in every project the app opens" in [app.md](app.md)). The two can be enabled in
the same project, and nothing collides:

- **Two marketplaces, two plugin ids**: `brigade@brigade` (this one, user's choice of scope) and
  `brigade-app@brigade-app` (the app's, local scope, marketplace under `~/.config/brigade/plugin-app/`). Installing,
  updating or removing one never touches the other.
- **One command name space, `brigade`**, on purpose: the commands are typed `/brigade:…` whichever plugin brings
  them. `/brigade:start` comes only from this plugin; `/brigade:dev` and `/brigade:init` only from the app's.
- **The one command both carry, `/brigade:ask`, is the same file**: the app copies `commands/ask.md` of this
  repository into its marketplace (`COMMANDS` in `plugin-app.ts`). Whichever copy Claude Code loads, the command
  says the same thing — at most one release apart, when the app and the installed plugin are not at the same
  version.

*Test: `app/test/plugin-of-the-directory.test.ts`.*

## The V1 files still in the repository

They stay on disk, out of the manifest, until a later ticket deletes them. The gates list them
(`NOT_PUBLISHED` in `.claude/brigade/gates.sh`): any other file of `commands/` or `agents/` must be declared.
What still reads each one:

| File | Still read by |
|---|---|
| `commands/po.md` | the gates (a V1 role: its Codex mirror `codex/skills/po/` must exist and stay fresh); `runtime/test/ste.test.ts` (reads its text) |
| `commands/manager.md` | the gates (role and mirror); `runtime/test/ste.test.ts` |
| `commands/dev.md` | **the app**: `app/src/plugin-app.ts` copies it as `/brigade:dev`, and the app's packaging ships it (`app/packaging/construire.ts`, `linux.ts`, `windows.ts`; their tests compare it); the gates (role and mirror); `runtime/test/ste.test.ts` |
| `commands/designer.md` | the gates (role and mirror) |
| `commands/sync.md` | nothing but the V1 texts that name it (the Codex mirrors, `commands/manager.md`, `scripts/update-partout.sh`) |
| `commands/init.md` | nothing reads the file; `app/test/plugin-app.test.ts` reads it to check the app's own `/brigade:init` differs from it |
| `agents/dev-teammate.md`, `-low`, `-medium` | `commands/manager.md` (V1) spawns them as `brigade:dev-teammate*`; the gates check their three bodies are the same |

The other agents of `agents/` are not V1 and stay: the runtime and its tests read them as files, never as plugin
agents — `agents/second-juge.md` (the second judge's brief, `runtime/src/second-juge.ts`), `agents/cook.md`,
`agents/triage.md`, `agents/manager.md`, `agents/product.md` and `agents/closer.md` (evals and tests). The new
kitchen reads `agents/kitchen/` itself.

## Publishing a change

A change of `commands/start.md`, `commands/ask.md` or `.claude-plugin/` reaches the installed plugins once it is
merged on `main` **and** `version` is bumped in `.claude-plugin/plugin.json`: without a bump, `claude plugin
update` says the plugin is already up to date. Check the manifests with `claude plugin validate .` before.
