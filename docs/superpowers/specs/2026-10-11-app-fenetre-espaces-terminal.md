# One window, one space per project, a real terminal inside — spec (#295)

**Date**: 2026-10-11
**Status**: decided by the dev, **to be contested in review** — the issue and the qualification of
the epic (#294) fixed the envelope, the zone and the pitfalls; what remained to be settled was
settled without `question-spec`, because none of it was a product decision the issue had not
already made. The chef-visible choices are listed in one block below so they can be reviewed in
one block.
**Issue**: #295 (milestone 6, epic #294)

The behavior, as the chef lives it, is in `docs/app.md`: that is the living doc, this document does
not copy it.

---

## What was tested before coding

By small throwaway scripts, on the Mac (Node 26.8.1, Electron 44.7.0, `claude` 2.1.286).

- **Electron runs the main process's TypeScript as is** (`"main": "src/main.ts"`): its Node (24.21)
  strips the types. No build on the main side.
- **node-pty 1.1.0 ships compiled for macOS and goes through N-API**: the same binary loads under
  Node 26 and under Electron 44. The pitfall "it compiles for Electron's ABI" therefore does not
  bite, and nothing compiles at setup.
- **node-pty 1.1.0 ships `spawn-helper` without the execute bit**: every launch fails with
  `posix_spawnp failed`. `pty.ts` restores it on load.
- **`claude --continue` in a folder with no conversation** writes `No conversation found to
  continue` and exits with **1**. It never silently starts a new session.
- **In a never-opened folder**, `claude` — with or without `--continue` — first asks its trust
  question.
- **A top-level `await` in the main module blocks Electron**: "ready" is only announced once the
  module is loaded. Hence `app.whenReady().then(…)`.

## What the dev decided

1. **The file**: `~/.config/brigade/app.json`, `{ "projets": [ { "nom", "dossier" } ] }`. An object
   rather than a bare list, so that #296 can add what it needs without changing shape. The app
   never writes it; absent or refused, it shows its path, the reason and an example. Read at
   startup only.
2. **An invalid file is refused whole; a missing folder only greys out its project.** The first
   fault is a typo to fix, the second an unplugged disk.
3. **Thread resumed or new session, without reading `claude`'s files.** The app always launches
   `claude --continue`; if it exits with an error, it launches `claude`, once, and says so.
   Rejected: looking under `~/.claude/projects/` for a conversation — that depends on a private
   layout of `claude`; and recognizing its error message — that depends on a sentence. The exit
   code is enough. **Accepted consequence**: a resumed thread that *crashes* (non-zero code) after
   hours is followed by a new session, announced as such with the code.
4. **A stopped second is not relaunched automatically**: it is said to be stopped, and a key
   relaunches it. Relaunching by itself would loop on a broken `claude`.
5. **Closing the window quits the app and stops the terminals.** The ptys live in the main
   process — which is what makes switching space harmless — but an app with no window that kept
   `claude` processes alive would be a state nothing shows.
6. **The second only starts at the first click** on its project: opening the app does not launch
   fifteen sessions.
7. **`claude` is launched directly**, with the app's environment. Launched by `npm start`, it has
   the terminal's; the `npm_*` variables are removed from it. The `PATH` of an app launched from
   the Finder is a packaging problem, out of scope.

## How it is done

| File | Role | Proved by |
|---|---|---|
| `app/src/config.ts` | read the projects file | `test/config.test.ts` |
| `app/src/terminaux.ts` | the registry: one second per project, its shells, resumed or new session, what the app says about it | `test/terminaux.test.ts` (fake pty) |
| `app/src/pty.ts` | the real pty (node-pty) | `test/pty.test.ts` (fake `claude`) |
| `app/src/main.ts`, `preload.cjs` | the window, and seven actions between the view and the registry | by launching the app |
| `app/src/vue/` | bar, tabs, one xterm per terminal, hidden when not displayed | by launching the app |

- **The view keeps no history on the main side.** Each terminal has its xterm, kept as long as the
  app is open; switching space hides it. No buffer to replay: there is only one window, and
  closing it quits.
- **The view is in JavaScript** (`// @ts-check`, checked by `tsc`): a browser does not strip
  types, and a bundler would be a build step for two hundred lines. xterm.js is imported by name
  thanks to an *import map*.
- **Gates**: the runtime's step became a function, played for `runtime/` then for `app/` — same
  tests, same clock guard, same kept log, same type check. The `tests` and `tests_s` measures add
  up both zones.
- **Setup**: `npm ci --ignore-scripts --prefix app`. Without scripts, hence without Electron's
  binary or any compile attempt on Linux. The cost is in `docs/app.md`, "What it weighs".

## What is not proved by a test

The view and `main.ts`. They were checked by hand on 2026-10-11, against the fake `claude`: two
projects, a new session in one, a resumed thread in the other, a shell opened, round trips between
spaces and tabs without loss, a project with a missing folder. Not against the real `claude`: that
is left to the chef.
