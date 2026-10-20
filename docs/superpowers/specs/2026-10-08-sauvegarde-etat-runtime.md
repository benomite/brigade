# The runtime state is backed up, and can be restored — spec and plan (#62)

**Date**: 2026-10-08
**Status**: approved on 2026-10-08 — the five recommendations at the end of the document are adopted as they stand
**Issue**: #62 "Nothing backs up the runtime state"
**Builds on**: `2026-10-08-brigade-v2-design.md` (principle 5: the durable artifacts remain
the truth), `2026-10-08-runtime-stack.md` (§3 the log and the lock, §6 deployment),
`2026-10-08-runtime-journal.md` (the append-only log, the recomputed projections)

---

## The deployment route: systemd, confirmed

The runtime stays a **systemd unit on the host**, `brigade@<project>.service`, as it is
written and acceptance-tested. The reason is specific to brigade, not to the box:

- The runtime has **nothing to isolate from itself**: no runtime dependency, no build, no
  port. A container would only add a layer to maintain.
- It does, however, **need the host**: the account's Max connection (`claude` reads its credentials
  where it left them), a logged-in `gh`, a `git` that pushes. A container would have them mounted one by one.
- The server becomes brigade's alone (#67): the cohabitation that justified Docker on the
  parade-box goes away with the abandoned services.
- The per-project lock wants a local disk; `StateDirectory=` provides it with no volume to declare.

The **per-project** container of milestone 7 (isolation of cooks) stays open: that is another
question, and nothing here closes it.

The backup follows the same route: a second template unit and its timer.

## What is in the state directory, and what the backup does with it

| Content | Nature | Backed up? |
|---|---|---|
| `log.db` (+ `-wal`, `-shm`) | **The truth**: the log, and the projections derived from it | **Yes**, by a consistent snapshot |
| `lock.db` | An empty file: the lock is a transaction held by the kernel, not data | **No**. It is recreated at startup |
| `runs/<run>.jsonl`, `.stderr` | The raw stream of each cook. Nothing that rebuilds the state lives there; it serves diagnosis, and the report of a delivery resumed after a crash | Per question 3 |
| `depot/` | The clone reserved for the station | **No**: it is recloned (`docs/runtime.md` § Installer) |
| `worktrees/<run>` | Each cook's worktree, dependencies included | **No**: what matters is pushed at harvest |

**A note on `lock.db`.** The qualification feared it named the pid and the machine of the
old runtime. It does not: `lock.db` contains nothing. The pid and the machine are in the
log (`runtime.started`), and a restored log whose last session has no end is
exactly that of a runtime that died without warning — startup writes `runtime.interrupted`, then
carries on. The "already running" refusal (code 2) only comes from a **held** lock, so never from a
copied file. The backup leaves `lock.db` out anyway: there is nothing in it to restore.

## The snapshot

`VACUUM INTO` from a read-only connection: SQLite writes a fresh, complete and
consistent database — the state of a read transaction —, without blocking the writer (WAL mode) and without
copying `-wal` or `-shm`. Verified on Node 26.8 while a writer holds an open
transaction: the snapshot contains what was committed, `PRAGMA integrity_check` answers `ok`.

`cp` is ruled out: a database open in WAL is copied as three files that do not match each other.

## The `backup` command

```bash
BRIGADE_STATE_DIR=<state> BRIGADE_BACKUP_DIR=<destination> npm --prefix runtime run backup
```

Module `runtime/src/sauvegarde.ts` (the logic, tested) and `runtime/src/sauvegarder.ts` (the
command). It runs while the runtime runs, or stopped.

1. `BRIGADE_BACKUP_DIR` missing → refusal, code 2. **No default**: a backup that picks its own
   destination ends up on the disk it was meant to protect.
2. Destination inside the state directory, or already holding another project's backups →
   refusal, code 2.
3. Snapshot into `<destination>/.en-cours-<timestamp>/log.db`, then check
   (`PRAGMA integrity_check`, and the last `seq`).
4. `runs/` per question 3.
5. A `manifeste.json`: project, timestamp, last `seq`, number of events, Node version.
6. Atomic rename to `<destination>/<UTC timestamp>/`. An interrupted backup leaves
   only an `.en-cours-*`, never something that looks like a backup; the next run removes it.
7. Rotation: backups beyond the retention are deleted (question 2), **after** the new one
   has succeeded — never before.
8. One line on the output (`backup 2026-10-08T03-30-00Z — 4,211 events, up to no. 4211`),
   code 0. Any failure: a message, code 1, and no rotation.

A state directory with no `log.db` (runtime never started): nothing to back up, code 0, and it says
so.

## The `restore` command

```bash
BRIGADE_STATE_DIR=<fresh state> npm --prefix runtime run restore -- <destination>/<timestamp>
```

- Refuses (code 2) if the state directory already contains a `log.db`: **a restore never
  overwrites a log**. The way to start over from a backup on a machine that already has a state
  is to move the old one aside by hand.
- Checks the backup before writing anything (`integrity_check`, manifest consistent with the database).
- Puts `log.db` in place, and `runs/` if it is in the backup. Puts neither `lock.db`, nor `depot/`, nor
  `worktrees/`.
- Says what it put in place and what is left to do: reclone the station's repo, start.

At the next startup, nothing special: the runtime notes `runtime.interrupted` if the backup was
taken while running, recomputes its projections, and the cooks that were running at the moment of
the backup are noted `cook.interrupted`, as after any cut.

## Without intervention: the unit and its timer

`runtime/deploy/brigade-sauvegarde@.service` (`Type=oneshot`, same `User=`, same
`BRIGADE_STATE_DIR` as the runtime, `ExecStart=… node src/sauvegarder.ts`) and
`runtime/deploy/brigade-sauvegarde@.timer` (`Persistent=true`: a backup missed during a
machine shutdown is caught up at boot). `BRIGADE_BACKUP_DIR` is set in a drop-in of the
instance — without it, the unit fails and `systemctl status` says why.

No token in this environment either: the command launches neither `claude` nor `gh`.

## The proof: a restore test

`runtime/test/sauvegarde.test.ts`, with no network and no real `claude`, on the order of a second:

1. A real runtime (`main.ts`, fake `gh`, fake `claude`) serves a ticket under a `merge` grant in a
   state directory A: the log carries `ticket.served`, `grant.used`, `cook.progressed`.
2. `backup` is played **while it runs**.
3. `restore` into a fresh directory B; a runtime starts on B: it **starts** (no code
   2), writes `runtime.interrupted` then `runtime.started`.
4. On B, `log`, `grant` and `station` read back the served ticket, the use of the grant and the report
   of the cook from before the backup.

And, per case: snapshot taken during an open write transaction; destination missing or
inside the state → refusal; restore onto an existing state → refusal; interrupted backup → no
half backup; rotation that deletes nothing when the new one fails.

## What the restore does not give back

To be written as is in `docs/runtime.md`:

- **What happened since the last backup.** The rail realigns itself on GitHub at the first
  poll (closed issues, removed labels); the grant uses and the reports of that window
  are lost. The cadence bounds this loss (question 1).
- **The worktrees.** A ticket **in pass** at the time of the backup gets its state back in the log,
  but no longer its worktree: the pass cannot rejudge it. The way out is the one that already exists —
  merge its PR by hand, or remove `fire`. A delivery not yet judged is raised under the
  reason `no-gates`, which is misleading (observed in a trial, flagged in triage). Uncommitted work of a
  running cook is lost.
- **The Max connection, `gh`, the account's git configuration**: these are not runtime states.
  They are redone at installation (`docs/runtime.md` § À vérifier avant d'installer).

## On the parade-box side

Nothing to write there: the chosen route asks nothing of it, and the box is being phased out (#67). Brigade's
backup depends neither on `scripts/backup.sh` nor on the box's volumes. What must
be said over there — "on its way to obsolescence, and toward what" — is a criterion of #67.

## Out of scope

- Sending the backup off the machine to a specific service: `BRIGADE_BACKUP_DIR` is a
  path; whether it is a mounted disk or an `rsync` relays it is an installation choice.
- Playing the installation on the server: the chef's acceptance test.
- Bounding `runs/` and `worktrees/` **at the source**: they grow without bound today, as
  `docs/runtime.md` says ("Rien n'est nettoyé"), and the backup is not what fixes it.

## Plan

1. `sauvegarde.ts` — snapshot, check, manifest, atomic rename (TDD).
2. Rotation and cleanup of the `.en-cours-*`.
3. `runs/` per question 3.
4. `restore` — refusal, check, put in place.
5. The two commands, their npm scripts, their refusals.
6. The end-to-end restore test.
7. The two systemd units; `docs/runtime.md`: the route and its reason, "Sauvegarder et
   restaurer", installing the timer, two acceptance steps.

## Questions for the chef

1. **Cadence.** *Recommended: once a day*, at a fixed time (03:30, as today on the
   box), adjustable through a timer drop-in. The maximum loss is then one day of log. An
   hourly cadence costs little (the database is small) and brings the loss down to an hour — to be chosen if
   a day of lost grant uses bothers you.
2. **Retention.** *Recommended: the last 14 backups* (`BRIGADE_BACKUP_KEEP`, default 14 —
   the box's 14 days). A snapshot is a whole database: retention is counted in
   backups, not in days.
3. **`runs/`.** *Recommended: keep everything, in a single copy.* The raw streams are copied into
   `<destination>/runs/`, outside the dated snapshots, and only new or changed files
   are copied again: a stream weighs only once, whatever the retention. The backup never
   deletes a stream — it grows like the source. Other routes: keep nothing of `runs/`
   (the log is enough to rebuild the state, the diagnosis is lost), or only the last N
   days.
4. **The worktrees are not backed up.** *Recommended: confirm.* Consequence stated above:
   after a restore, a ticket in pass is finished by hand.
5. **Should the backup show in the kitchen?** A backup that fails silently
   is not one. *Recommended: a successful backup writes a fact to the log
   (`backup.completed`, author `sauvegarde`) — so readable through `log` — and nothing more in
   this ticket*; showing it in `status` ("last backup … ago") and alerting on its age
   would be a ticket of its own. Without this fact, the only trace is `systemctl status
   brigade-sauvegarde@<project>`.
