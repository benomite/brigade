# A Mac serves a project with the kitchen

The kitchen (`runtime/src/kitchen/main.ts`) serves the projects of `<BRIGADE_STATION_DIR>/kitchen/projects`. On a
Mac, it is the station itself: the app runs it as this computer's station (`PRINCIPAL`,
`app/src/workstation/role.ts`), with `BRIGADE_STATION_DIR` set to the station's folder, or the launchd daemon of the
station archive runs it when the app does not. Only one runs at a time (`app.pid`).

## Declare the project

Add one line to `<BRIGADE_STATION_DIR>/kitchen/projects` (create the `kitchen/` folder if needed):

```
<name> <owner/repo> <base> [PLACES=<n>] [CLONE=<path>]
```

- `CLONE=` points at an existing clone; without it, the clone is `<BRIGADE_STATION_DIR>/<name>/depot`. The kitchen's
  state and worktrees go to `<BRIGADE_STATION_DIR>/kitchen/<name>/`.
- No restart is needed: the kitchen reads the file again at every turn. If the kitchen exits, what holds it starts
  it again. Stopping it stops no agent: agents in flight keep running under their relays.

To stop serving a project, remove its line from `kitchen/projects`.

## What the sandbox needs

On macOS the kitchen launches every agent (cook, pass, manager, supervisor) inside Claude Code's sandbox, with
the project's network allowlist (`.claude/brigade/reseau` on its base branch). See
[`bac-a-sable.md`](bac-a-sable.md), "The kitchen on a Mac". The detection
(`runtime/src/bac-a-sable/detection.ts`) needs:

- Seatbelt: `/usr/bin/sandbox-exec` exists;
- a `claude` recent enough to read the sandbox configuration (`VERSION_MINIMALE` in `detection.ts`);
- `HOME` set to an absolute path, and absolute paths in the project's caches variable, `BRIGADE_SANDBOX_CACHES`.

## When the sandbox is missing

The kitchen launches **no agent** for the project: no agent ever runs without its safeguards. The station's log
says why in one line, `no agent launched: on macOS every agent runs inside Claude Code's sandbox, and it is not
usable — <reason>`. Fix what the reason names (most often `claude update`); the kitchen tries again at its next
turn, with no restart. If the Mac cannot get a sandbox, serve the project from the box instead: move its line to the
box's `kitchen/projects`.
