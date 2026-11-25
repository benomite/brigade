// Where the logbook of the day goes (#4280, spec 2026-11-23-autonomy-trust-control, T1): one place only.
//
// - The morning digest is written to the journal (`digest.published`), from which `lireEtat` reads the last one back
//   and `faits` gives it to the project view, where the app shows it as a card. It is never pushed as a message.
// - A gesture handed to the chef — the system gave up and needs them — is the only one that notifies: `chef.notified`,
//   which `faits` gives as `notification`.
//
// matin.ts builds the digest each morning and publishes it here.
import type { Journal } from "../journal.ts";
import type { NotificationDAbandon } from "./notifications.ts";

const AUTEUR = "runtime";

export type DigestPublie = { day: string | null; text: string; at: string };
export type AbandonNotifie = { at: string; line: string; reason: string; notifiedAt: string };

type OptionsDePublication = {
  // The day the digest tells, YYYY-MM-DD: a second digest of the same day is not written.
  jour?: string;
  // A push channel a caller may hold: the digest never uses it — it is a reading, not a message.
  pousser?: (message: unknown) => void;
};

// Keeps the digest for the project view. Returns false when the digest of that day was already there.
export function publierLeDigest(journal: Journal, projet: string, texte: string, { jour }: OptionsDePublication = {}): boolean {
  const ecrit = journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "digest.published", payload: { day: jour ?? null, text: texte }, ...(jour === undefined ? {} : { dedupKey: `digest.published:${projet}:${jour}` }) });
  return ecrit !== null;
}

// The last digest published, null before the first.
export function dernierDigest(journal: Journal): DigestPublie | null {
  const dernier = journal.duType("digest.published", 1)[0];
  return dernier === undefined ? null : { day: dernier.payload.day, text: dernier.payload.text, at: dernier.at };
}

// The notifier of the give-ups: the notification is written to the journal, from which the project view reads it.
export function notifierAuJournal(journal: Journal, projet: string): (notification: NotificationDAbandon) => void {
  return ({ at, line, reason }) => void journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "chef.notified", payload: { at, line, reason } });
}

// The last give-up notified to the chef, null before the first.
export function dernierAbandon(journal: Journal): AbandonNotifie | null {
  const dernier = journal.duType("chef.notified", 1)[0];
  return dernier === undefined ? null : { ...dernier.payload, notifiedAt: dernier.at };
}
