# `status` shows the age of the last backup, and flags it — spec and plan (#76)

**Date**: 2026-10-08
**Status**: validated on 2026-10-08 — the four recommendations were accepted as they stood by the Manager
**Issue**: #76 "Nothing shows the age of the last backup, nor alerts when it gets old"
**Builds on**: `2026-10-08-sauvegarde-etat-runtime.md` (#62: `backup.completed`),
`2026-10-08-runtime-status.md` (`status`, "the whole display derives from the log"),
`2026-10-08-age-de-bail-sans-progres.md` (a date in the projection, a duration at display time)

---

## What is missing

Since #62, every successful backup writes `backup.completed` to the log. A failure writes
nothing there: a timer that was never enabled, a full destination or a lost drop-in stay invisible
until someone looks for the last fact by hand. A backup that fails silently is not a backup.

## The last backup is a projection

No new fact. A `sauvegardes` projection listens to `backup.completed` and keeps a single
row (`backup_last`): the date of the fact, the name of the backup, and `lastSeq`. Each success
replaces the previous one. Time does not enter the projection: it carries a date, and the age is
counted at display time.

**Existing log**: the table only exists after a replay. `status` on a log that has not been
replayed yet already answers "restart the runtime"; nothing to add.

**After a restore**: the snapshot is taken before the fact is written, so a backup does not
contain its own success. The restored log shows the previous backup, or none. This is stated in
the doc, not fixed.

## The declared age

| Question | Decision |
|---|---|
| Where is the maximum age declared? | `BRIGADE_BACKUP_MAX_AGE_HOURS`, read by `status`. `backup.completed` does not carry its cadence, and the cadence lives in the systemd timer, which the command does not know. An invalid value is a refusal (code 2) |
| Which default? | 48 h: two cadences of the shipped timer. A missed night is caught up at the next start without an alarm; two are flagged. It is a setting, not a mandatory variable |
| Is "never done" flagged from day one? | Yes, dev workstation included: a state with no backup is exactly the case the issue targets |
| Does the exit code of `status` change? | No, it stays 0: `status` is a photo. An alert channel outside `status` is out of scope |

The age is flagged when it **exceeds** the cap; equal, it is not flagged yet.

## The display

A `backup` line in the header, after `kitchen`:

```
backup 7 h 12 ago (2026-10-08T03-30-00Z, up to event 412)
backup TOO OLD: 3 d ago (2026-10-05T03-30-00Z, up to event 398) — more than 2 d: systemctl status brigade-sauvegarde@brigade
backup NEVER DONE — is the timer brigade-sauvegarde@brigade running?
```

The unit name carries the project read from the log; on an empty log, `<projet>`.

## Plan

1. `runtime/src/projections/sauvegardes.ts` and its registration in the registry; a test of the
   projection, and two backups in the history of the replay test.
2. `runtime/src/etat.ts`: `EtatCuisine.sauvegarde`, the line, the default cap; tests of the
   three renderings and of the configured cap.
3. `runtime/src/status.ts`: reading and checking the variable; tests of the command.
4. `docs/runtime.md`: the `backup` block of `status`, the variable, the backup section that
   said "nothing alerts", the restore.
