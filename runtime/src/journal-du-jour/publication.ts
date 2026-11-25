// Where the logbook of the day goes (#4280, spec 2026-11-23-autonomy-trust-control, T1): one place only.
//
// - The morning digest is written to the journal (`digest.published`), from which `lireEtat` reads the last one back
//   and `faits` gives it to the project view, where the app shows it as a card. It is never pushed as a message.
// - A gesture handed to the chef — the system gave up and needs them — is the only one that notifies: `chef.notified`,
//   which `faits` gives as `notification`.
//
// `brancherLeDigest` builds the digest of the previous day once each morning, on the runtime's tick, from the agents'
// threads (`autonomie/agents/gestes.ts`) and the post-mortems (`post-mortems/post-mortems.ts`). A thread or a
// post-mortem file that cannot be read publishes nothing: it is said, and tried again ten minutes later.
import { GestesIllisibles, tousLesGestes } from "../autonomie/agents/gestes.ts";
import type { Journal } from "../journal.ts";
import { lireLesFinsDesPannes, lirePostMortems } from "../post-mortems/post-mortems.ts";
import type { Runtime } from "../runtime.ts";
import { digestDeLaVeille, jourDeLaVeille } from "./digest.ts";
import type { NotificationDAbandon } from "./notifications.ts";

const AUTEUR = "runtime";
// The digest of the previous day is built on the first tick at or after this hour (UTC): 7:00 in Paris in winter.
export const HEURE_DU_DIGEST_UTC = 6;
const RELANCE_MS = 10 * 60_000;

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

export type Passage = "pas-encore" | "deja-publie" | "publie" | "echec";

const uneLigne = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";

// One pass: before the morning hour, or once the digest of the previous day is out, nothing.
export function passerLeDigest(journal: Journal, projet: string, repertoireEtat: string, maintenant: Date, avertir: (ligne: string) => void): Passage {
  if (maintenant.getUTCHours() < HEURE_DU_DIGEST_UTC) return "pas-encore";
  const jour = jourDeLaVeille(maintenant);
  if (dernierDigest(journal)?.day === jour) return "deja-publie";
  let texte: string;
  try {
    const fins = lireLesFinsDesPannes(repertoireEtat, projet);
    const postMortems = lirePostMortems(repertoireEtat, projet).map((postMortem, rang) => ({ ...postMortem, fin: fins[rang] as string }));
    texte = digestDeLaVeille({ postMortems, fils: tousLesGestes(repertoireEtat) }, maintenant);
  } catch (erreur) {
    const quoi = erreur instanceof GestesIllisibles ? "the agents' threads do not read" : "the post-mortems do not read";
    avertir(`digest of ${jour} — not published, ${quoi}, tried again later: ${uneLigne(erreur)}`);
    return "echec";
  }
  return publierLeDigest(journal, projet, texte, { jour }) ? "publie" : "deja-publie";
}

// The digest, on each tick of the runtime; after a failed pass, none before `RELANCE_MS`.
export function brancherLeDigest<R extends Pick<Runtime, "journal" | "projet" | "surReveil">>(runtime: R, { repertoireEtat, avertir, maintenant = () => new Date() }: { repertoireEtat: string; avertir: (ligne: string) => void; maintenant?: () => Date }): R {
  let pasAvant = 0;
  runtime.surReveil((cause) => {
    if (cause !== "tick" || maintenant().getTime() < pasAvant) return;
    if (passerLeDigest(runtime.journal, runtime.projet, repertoireEtat, maintenant(), avertir) === "echec") pasAvant = maintenant().getTime() + RELANCE_MS;
  });
  return runtime;
}
