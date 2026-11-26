// The facts of the logbook of the day (#4280, spec 2026-11-23-autonomy-trust-control, T1): the morning digest of the
// previous day, kept for the project view, and the notification sent to the chef when the system gives up.
//
// `digest.published`: the digest of `day` (YYYY-MM-DD, UTC), a few lines; the project view shows the last one as a
// card. It is never pushed as a message.
// `chef.notified`: an agent handed a gesture to the chef — the system gave up and needs them. The only notification
// the logbook sends.
export type FaitJournalDuJour =
  | { type: "digest.published"; payload: { day: string | null; text: string } }
  | { type: "chef.notified"; payload: { title: string; at: string; line: string; reason: string } };
