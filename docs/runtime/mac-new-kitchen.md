# A Mac serves a project with the new kitchen

The new kitchen (`runtime/src/kitchen/main.ts`) serves the projects of `<BRIGADE_STATION_DIR>/kitchen/projects`.
On the box, its own systemd unit runs it (`runtime/deploy/brigade-kitchen.service`). On a Mac, the station the app
launches runs it itself (`runtime/src/station/new-kitchen.ts`, #4484).

An update restarts it on the code it installs (#4604): on the box, the package's `postinst` restarts
`brigade-kitchen` after the station when the unit is enabled or running; on a Mac, the station's restart stops its
kitchen and the new station starts it again. Agents in flight keep running in both cases.

## Declare the project

Add one line to `<BRIGADE_STATION_DIR>/kitchen/projects` (create the `kitchen/` folder if needed):

```
<name> <owner/repo> <base> [PLACES=<n>] [CLONE=<path>]
```

- `<name>` is the project's name in the station. If the station's configuration (`<BRIGADE_STATION_DIR>/projets`)
  has a line with the same name, the **old runtime stops serving it**: its cooks in flight finish, and the station's
  log says `served by the new kitchen (kitchen/projects): the old runtime does not serve it`. Its repository is also
  left out of the projects the station serves from GitHub only (`station-ordinateur/`).
- `CLONE=` points at an existing clone; without it, the clone is `<BRIGADE_STATION_DIR>/<name>/depot`. The kitchen's
  state and worktrees go to `<BRIGADE_STATION_DIR>/kitchen/<name>/`.
- No restart is needed. The station checks the file every two seconds: when the first project is listed, it
  starts `node src/kitchen/main.ts` with `BRIGADE_STATION_DIR` set to its own folder and the rest of its own
  environment, gates included. The kitchen reads the file again at every turn. If the kitchen exits, the station
  starts it again ten seconds later. Stopping the station stops the kitchen; agents in flight keep running under
  their relays.

To give a project back to the old runtime, remove its line from `kitchen/projects`.

## What the sandbox needs

On macOS the kitchen launches every agent (cook, closer, reviewer, manager) inside Claude Code's sandbox, with
the project's network allowlist (`.claude/brigade/reseau` on its base branch). See
[`bac-a-sable.md`](bac-a-sable.md), "The new kitchen on a Mac". The detection
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
