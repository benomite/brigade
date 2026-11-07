// The ticket-times line of `status`: median and slowest of the last 10 measured
// tickets (from filing, or fire, to merge since #2662), the split by phase, and their median lost time against the project's threshold (#2670). Reads the two files of
// `.claude/brigade/` directly — nothing written, and a missing or unreadable
// file reads as "no measured ticket yet".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dureeDuTicket as duree, medianePerdueDesRecents, PHASES, SEUIL_PERDU_PAR_DEFAUT_MIN, seuilDuProjet } from "../temps-max/mesure.ts";
import { ticketsDuFichier } from "./mesure.ts";
import { type EnregistrementTemps, mediane, PHASES as PHASES_REQUISES } from "./synthese.ts";

const DERNIERS = 10;

// Un enregistrement de `temps-tickets.json` (`synthese.ts`) tel que l'écran le
// lit : ses dates peuvent manquer.
export type TempsTicket = Omit<EnregistrementTemps, "claimedAt" | "mergedAt"> & Partial<Pick<EnregistrementTemps, "claimedAt" | "mergedAt">>;

const entier = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

const minutes = (secondes: number) => `${Math.round(secondes / 60)}m`;

export function direLesTempsDesTickets(enregistrements: TempsTicket[], seuilMin: number = SEUIL_PERDU_PAR_DEFAUT_MIN): string {
  if (enregistrements.length === 0) return "tickets: no measured ticket yet";
  const derniers = enregistrements.slice(-DERNIERS);
  const durees = derniers.map(duree);
  const med = mediane(durees);
  const dureeMax = Math.max(...durees);
  const plusLent = derniers[durees.indexOf(dureeMax)]?.ticket;
  const moyenne = (p: (t: TempsTicket) => number) => mediane(derniers.map(p));
  const phases = [
    `cook ${minutes(moyenne((t) => t.cuisson))} (tests ${minutes(moyenne((t) => t.cuissonTests))})`,
    `pass ${minutes(moyenne((t) => t.attentePasse))}`,
    `review ${minutes(moyenne((t) => t.revue))}`,
    `CI ${minutes(moyenne((t) => t.ci))}`,
    `merge ${minutes(moyenne((t) => t.merge))}`,
  ].join(" · ");
  const perdu = medianePerdueDesRecents(enregistrements) ?? 0;
  const depasse = perdu > seuilMin * 60 ? " — over the threshold" : "";
  return `tickets: median ${minutes(med)} (slowest #${plusLent} ${minutes(dureeMax)}) | ${phases} | lost ${Math.round(perdu / 6) / 10}m, max ${seuilMin}m${depasse}`;
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    return null;
  }
}

// What the two files say, as the app's project view takes it: the valid records
// (as written, in order) and the project's lost-time threshold (`lostTimeMaxMin`).
// Nothing is written; a missing or unreadable file reads as no record and the
// default threshold.
export function lesTempsDesTickets(repertoireDepot: string | undefined): { enregistrements: TempsTicket[]; lostTimeMaxMin: number } {
  if (!repertoireDepot) return { enregistrements: [], lostTimeMaxMin: SEUIL_PERDU_PAR_DEFAUT_MIN };
  const dossier = join(repertoireDepot, ".claude", "brigade");
  // Lu tel quel : chaque entrée est vérifiée ci-dessous — les phases de tout
  // enregistrement y sont, celles d'avant la prise, des cooks ratés et des
  // renvois seulement depuis #2662.
  const liste = (ticketsDuFichier(lireJson(join(dossier, "temps-tickets.json"))) ?? []) as TempsTicket[];
  const enregistrements = liste.filter(
    (r): r is TempsTicket => typeof r === "object" && r !== null && Number.isInteger(r.ticket) && PHASES_REQUISES.every((p) => entier(r[p])) && PHASES.every(([p]) => r[p] === undefined || entier(r[p])),
  );
  return { enregistrements, lostTimeMaxMin: seuilDuProjet(lireJson(join(dossier, "projet.json"))) };
}

export function ligneDesTempsDesTickets(repertoireDepot: string | undefined): string {
  const { enregistrements, lostTimeMaxMin } = lesTempsDesTickets(repertoireDepot);
  return direLesTempsDesTickets(enregistrements, lostTimeMaxMin);
}
