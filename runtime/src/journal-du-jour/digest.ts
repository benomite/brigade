// The morning digest of the previous day (#4280, spec 2026-11-23-autonomy-trust-control, T1 and Q3): one text of a
// few lines, built from the agents' threads (their gesture logs) and the post-mortems (T4) of that day. Its first line
// is the key measure — the outages seen first by the chef —; then one line per kind of gesture that happened: what was
// delivered, what broke, what the system fixed by itself, what it could not fix, and its own mistakes. A day with
// nothing to say gives the first line alone.
//
// The day is the UTC day before the morning it is built on. Building it sends nothing: it is a reading
// (publication.ts keeps it for the project view).
import { OUTCOME } from "../autonomie/agents/gestes.ts";
import { notificationsDuJournal, type GesteDuFil } from "./notifications.ts";

const JOUR_MS = 24 * 60 * 60_000;
// Items named on one line; the others are counted.
const NOMMES_PAR_LIGNE = 3;

// A post-mortem with the end of its outage, as `faits` publishes it (post-mortems.ts).
export type PostMortemDuJour = { vuEnPremier: string; fin: string };

export type SourcesDuDigest = { postMortems: readonly PostMortemDuJour[]; fils: Readonly<Record<string, readonly GesteDuFil[]>> };

// The lines of the digest after the first, in this order, in the logbook's words.
const SORTES = [
  ["delivered", "Delivered"],
  ["broke", "Broke"],
  ["fixed", "Fixed by itself"],
  ["unfixed", "Could not fix"],
  ["mistake", "Its own mistakes"],
] as const;
type Sorte = (typeof SORTES)[number][0];
const estSorte = (kind: string | undefined): kind is Sorte => SORTES.some(([sorte]) => sorte === kind);

// What a gesture was. Handed to the chef, the system could not fix it, whatever its kind: those are the gestures that
// notified the chef (notifications.ts). Otherwise, the kind its agent said, or else what its outcome says. A gesture
// with no kind and not done (an agent on `observe`) is none.
function sorteDe(geste: GesteDuFil): Sorte | null {
  const { kind, outcome } = geste;
  if (notificationsDuJournal([geste]).length > 0) return "unfixed";
  if (estSorte(kind)) return kind;
  if (outcome === OUTCOME.FIXED_BY_SELF) return "fixed";
  return null;
}

// The day before this morning, YYYY-MM-DD in UTC.
export const jourDeLaVeille = (matin: Date): string => new Date(matin.getTime() - JOUR_MS).toISOString().slice(0, 10);

const pluriel = (combien: number, mot: string) => `${combien} ${mot}${combien === 1 ? "" : "s"}`;

function ligneDe(titre: string, lignes: readonly string[]): string {
  const nommes = lignes.slice(0, NOMMES_PAR_LIGNE).join("; ");
  const autres = lignes.length - NOMMES_PAR_LIGNE;
  return `${titre}: ${nommes}${autres > 0 ? ` and ${autres} more` : ""}.`;
}

export function digestDeLaVeille({ postMortems, fils }: SourcesDuDigest, matin: Date): string {
  const debut = Date.parse(`${jourDeLaVeille(matin)}T00:00:00.000Z`);
  const dansLaVeille = (instant: string) => {
    const le = Date.parse(instant);
    return le >= debut && le < debut + JOUR_MS;
  };
  const pannes = postMortems.filter(({ fin }) => dansLaVeille(fin));
  const parLeChef = pannes.filter(({ vuEnPremier }) => vuEnPremier === "chef").length;
  const parLeSysteme = pannes.length - parLeChef;

  const gestes = Object.values(fils).flat().filter(({ at }) => dansLaVeille(at)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const suite = SORTES.flatMap(([sorte, titre]) => {
    const siens = gestes.filter((geste) => sorteDe(geste) === sorte).map(({ line }) => line);
    return siens.length === 0 ? [] : [ligneDe(titre, siens)];
  });

  const premiere = `${pluriel(parLeChef, "outage")} seen first by the chef yesterday${parLeSysteme > 0 ? `, ${parLeSysteme} first by the system` : ""}${suite.length === 0 ? " — nothing else to report." : "."}`;
  return [premiere, ...suite].join("\n");
}
