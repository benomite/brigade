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

The V1 plugin (its roles and its Codex mirror) is no longer
published from `main`. It stays installable from the tag `v1-final`:
`/plugin marketplace add benomite/brigade@v1-final`, then `/plugin install brigade@brigade`.

## Its four commands

- **`/brigade:start`** (`commands/start.md`): what brigade is in five lines (the **rail**, the **cook**, the
  **pass**, the **second**); whether `gh` is installed and logged in; the repository you are in (`owner/repo`, its
  default branch, whether you can push, whether brigade already knows it); and the app download for your
  computer — the file of the newest `app-v*` release for macOS on Apple silicon, Linux x64 or Windows x64, or the
  releases page when `gh` cannot read them. It only reads: its allowed tools are `gh --version`,
  `gh auth status`, `gh repo view`, `gh release list|view`, `git rev-parse`, `git remote` and `uname`.
- **`/brigade:ask <number> [question]`** (`commands/ask.md`): where a ticket stands and what it waits for, or the
  answer to your question about it, from what GitHub says. It only reads.
- **`/brigade:ticket [idea]`** (`commands/ticket.md`, #4526): writes one kitchen-format issue on the repository you
  are in, after a short dialogue and your go. It creates nothing before a clear yes.
- **`/brigade:todo`** (`commands/todo.md`, #4527): lists the open issues parked for you (`parked:chef`) on the
  repository you are in, oldest first, and answers them one by one, as the app's Answer does. It writes to GitHub
  only once you have answered.

All four are written in English and answer in your language.

The manifest declares these four files and an empty `agents` list. Both keys are needed: when a manifest does not
name `commands` or `agents`, Claude Code loads every `.md` of the plugin's `commands/` or `agents/` folder. The gates
check that every file the manifest names exists. `agents/` holds only `kitchen/`: the runtime reads
`agents/kitchen/second-judge.md` (the second judge's brief, `runtime/src/second-juge.ts`) as a file, never as a plugin
agent.

## Publishing a change

A change of `commands/start.md`, `commands/ask.md`, `commands/ticket.md`, `commands/todo.md` or `.claude-plugin/` reaches the installed plugins once it is
merged on `main` **and** `version` is bumped in `.claude-plugin/plugin.json`: without a bump, `claude plugin
update` says the plugin is already up to date. Check the manifests with `claude plugin validate .` before.
