# Updating a box: a named action, and two drifts that can be read (#337)

## The problem

After a `git pull` in `/opt/brigade`, two things remain as they were before with nothing saying so:
**the installed units** (copies of `runtime/deploy/`, which a pull does not touch) and **the running
runtime** (`node` read its code when starting). The action that updates was written only in
a cell of the "Piloter" table of `docs/runtime.md`, and the check (`run installation`)
saw neither drift.

## What is decided

Framing by the Manager, recorded on the issue (2026-10-12); the choices left to the dev are marked.

- **The action is named where the installer is**: `docs/installer.md`, "Mettre brigade à
  jour", under action 5. It is not numbered — the ten actions of the walkthrough are those of an
  installation, and the "action N" references stay correct. The "Piloter" cell becomes a
  reference.
- **The two drifts are two findings of `verifier()`**, each a pure judgment (`jugerUnites`,
  `jugerCode`), modelled on `jugerTemporaire`. **"Up to date" is an `ok` line** for each,
  not the absence of the other.
- **They are `à savoir`, not `MANQUE`** *(dev's choice)*. `MANQUE` means "a cook launched now
  would fail", and the command then exits with `1`: that is not the case of a box
  that is behind, and the chef decides when it restarts.
- **Where the installed units are** *(dev's choice)*: where systemd loads the project's unit from
  (`systemctl show -p FragmentPath`). No hard-coded path, no extra variable: the `systemctl`
  stand-in of the tests dictates it.
- **Which code the runtime runs on** *(dev's choice — the smaller of the two)*: a fact that the
  runtime leaves at its start in `$BRIGADE_STATE_DIR` (`code-en-service`), and which is
  **the fingerprint of the contents of `runtime/src/`**, not a commit. What this removes: `git` at
  start (the `/opt/brigade` clone belongs to `root`, the service runs under another account — `git`
  refuses a repository there that is not its own), any comparison of clocks, and the false positive of a
  pull that does not touch the runtime (doc, app, plugin). What it costs: the line names no
  commit. "The service is running" is read from systemd (`ActiveState`): when stopped, what it left
  last time does not count.
- **A runtime that runs without having left anything is stale**: it predates this finding — this is
  exactly the case of the first update that brings this ticket.
- **A unit that is not installed is not compared**; the `ok` line names what was.
- **`cloison.conf`** *(dev's choice)* is a copy, but one that the doc has the chef adjust
  (`BRIGADE_SANDBOX_HIDDEN`, `BRIGADE_SANDBOX_PRIVATE`). It is compared with those two lines set
  aside, and its action is not a blind `cp`: it says to carry the settings over.

## Out of scope

- A command that *does* the update, or an automatic update.
- `app/`: its reference to "Piloter" remains valid, the cell refers there to the action.
- The code the door and the arbiter run on: the action restarts the door with the runtime,
  and the arbiter has its ticket (#321). Their **units**, however, are compared.

## Plan

1. Tests (`runtime/test/installation.test.ts`, "la mise à jour de la box"): units up to date,
   stale, partition set then stale, silent systemd; runtime stopped, up to date, stale, without
   fingerprint; the fingerprint; the command. `main.test.ts`: the runtime leaves its fingerprint.
2. `runtime/src/code.ts` (the fingerprint, leaving it, re-reading it), `main.ts` (leaving it, lock
   held), `installation.ts` (the two judgments, wired into `verifier()`).
3. `docs/installer.md` (the action, the output of action 8, the recipe for the real box),
   `docs/runtime.md` (the reference, the state file).
