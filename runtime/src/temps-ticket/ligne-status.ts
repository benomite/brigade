// The ticket-times line of `status`: median and slowest of the last 10 measured
// tickets, the split by phase, and the project's max. Reads the two files of
// `.claude/brigade/` directly — nothing written, and a missing or unreadable
// file reads as "no measured ticket yet".
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DERNIERS = 10;
const MAX_PAR_DEFAUT_MIN = 15;

export type TempsTicket = {
  ticket: number;
  claimedAt?: string;
  mergedAt?: string;
  cuisson: number;
  cuissonTests: number;
  attentePasse: number;
  revue: number;
  ci: number;
  merge: number;
};

const PHASES = ["cuisson", "attentePasse", "revue", "ci", "merge"] as const;

const entier = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

const minutes = (secondes: number) => `${Math.round(secondes / 60)}m`;

function mediane(valeurs: number[]): number {
  const tri = [...valeurs].sort((a, b) => a - b);
  const m = tri.length >> 1;
  return tri.length % 2 === 1 ? (tri[m] ?? 0) : ((tri[m - 1] ?? 0) + (tri[m] ?? 0)) / 2;
}

const total = (t: TempsTicket) => PHASES.reduce((somme, p) => somme + t[p], 0);

// The ticket's duration: claim to merge when both dates are there, else its phases summed.
function duree(t: TempsTicket): number {
  const de = Date.parse(t.claimedAt ?? "");
  const a = Date.parse(t.mergedAt ?? "");
  return Number.isNaN(de) || Number.isNaN(a) || a < de ? total(t) : (a - de) / 1000;
}

export function direLesTempsDesTickets(enregistrements: TempsTicket[], maxMin: number = MAX_PAR_DEFAUT_MIN): string {
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
  const depasse = med > maxMin * 60 ? " — over the max" : "";
  return `tickets: median ${minutes(med)} (slowest #${plusLent} ${minutes(dureeMax)}) | ${phases} | max ${maxMin}m${depasse}`;
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    return null;
  }
}

// What the two files say, as the app's project view takes it: the valid records
// (as written, in order) and the project's max. Nothing is written; a missing or
// unreadable file reads as no record and the default max.
export function lesTempsDesTickets(repertoireDepot: string | undefined): { enregistrements: TempsTicket[]; tempsMaxTicketMin: number } {
  if (!repertoireDepot) return { enregistrements: [], tempsMaxTicketMin: MAX_PAR_DEFAUT_MIN };
  const dossier = join(repertoireDepot, ".claude", "brigade");
  const brut = lireJson(join(dossier, "temps-tickets.json"));
  const liste = Array.isArray(brut) ? brut : [];
  const enregistrements = liste.filter(
    (r): r is TempsTicket => typeof r === "object" && r !== null && Number.isInteger(r.ticket) && PHASES.every((p) => entier(r[p])) && entier(r.cuissonTests),
  );
  const projet = lireJson(join(dossier, "projet.json")) as { tempsMaxTicketMin?: unknown } | null;
  const max = projet?.tempsMaxTicketMin;
  return { enregistrements, tempsMaxTicketMin: typeof max === "number" && max > 0 ? max : MAX_PAR_DEFAUT_MIN };
}

export function ligneDesTempsDesTickets(repertoireDepot: string | undefined): string {
  const { enregistrements, tempsMaxTicketMin } = lesTempsDesTickets(repertoireDepot);
  return direLesTempsDesTickets(enregistrements, tempsMaxTicketMin);
}
