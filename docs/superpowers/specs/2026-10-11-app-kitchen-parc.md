# The kitchen: all projects, and those we no longer drive — spec (#297)

**Date**: 2026-10-11
**Status**: decided by the dev, **to be contested in review** — the issue, the PO's comment (no
version number) and the Manager's qualification fixed the means, the three states and the
pitfalls; what remained was settled without `question-spec`.
**Issue**: #297 (milestone 6, epic #294)

The behaviour, as the chef lives it, is in `docs/app.md` ("La kitchen"): this document does not
copy it.

## What was tested before coding

Against a real OpenSSH (the Mac's client, a throwaway `sshd` on `127.0.0.1`), launched by `execFile`
with a 3 s timeout:

| Case | What Node returns |
|---|---|
| Remote command that hangs (`sleep 60`), `ssh` connected | `killed: true`, **`code: 255`**, no signal |
| Silent host (`10.255.255.1`), without `ConnectTimeout` | `killed: true`, `code: null`, `SIGTERM` |
| Silent host, `ConnectTimeout=1` | `killed: false`, `code: 255`, `ssh: connect to host … Operation timed out` |

The review finding of #296 is therefore **true**: once connected, `ssh` catches the timeout's signal
and exits on its own with 255. `killed && code === null` missed this case, which read as "exit code 255".

## What the dev settled

1. **The timeout is recognised by `killed`, whatever the code**, and `ssh` receives
   `ConnectTimeout=10` (the timeout is 30 s). A silent box is then reported by `ssh` itself,
   with 255 and its message; an `ssh` still there at the timeout had reached its box. The timeout is
   therefore filed under "reached, but no longer drivable".
2. **The three states are read from the code alone**: succeeded → drivable; 255, or `ssh` impossible to
   launch → not reached; any other code, or the timeout → reached, but no longer drivable.
3. **The gauges are the `quota` and `machine` lines of `run station`.** It is the only
   command that reports both every time, and that the chef's `commande` can launch. `arbiter` requires
   its unit's environment (`BRIGADE_ARBITER_PORT`) and does not talk about the quota; `status` only
   reports the machine when saturated. No command prints the measured load outside saturation: the
   kitchen shows a state (`holds` / `SATURATED … load of X for Y`), not a level.
4. **The kitchen launches `status` then `station`**; a project's space keeps `status` then `grant`
   (#296). Accepted consequence: a runtime without `station` is drivable in its space and "no longer
   drivable" in the kitchen — each screen reports what its commands returned.
5. **A project's commands go one after the other**, no longer in parallel: the kitchen reads all
   projects at once, and `sshd` randomly refuses connections not yet authenticated
   beyond ten (`MaxStartups`) — which would read "not reached", wrongly.
6. **A project's block is the entire output of `status`**, not a summary (qualification:
   "not a second summary"). The glance comes down to the state header and what `status` puts
   first; for two to five projects, the page scrolls.
7. **The named action** is the runtime update (`docs/runtime.md`, "Piloter"), always the
   same: the app does not choose an action according to a cause it does not know.
8. **The app opens on the kitchen**, in place of "Choisis un projet dans la barre".
9. **The header of a project's panel says the same three states** as the kitchen: a single
   rendering function for both.
