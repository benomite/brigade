// Ce que les temps des tickets mergés (#4308) lisent, sans rien demander à
// GitHub : le temps de chaque ticket servi que la station écrit déjà au merge
// (`.claude/brigade/temps-tickets.json` du clone — sa prise lue sur GitHub,
// « Taken by station », ses phases et ses passages en pass), et, à côté, la
// fiche que la station écrit au même moment : son titre et ses labels
// (`delais-tickets.json`). Un ticket mergé avant cette fiche n'a ni titre ni
// label : il compte sans temps attendu.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { calibrage } from "../calibrage.ts";
import { lesTempsDesTickets, type TempsTicket } from "../temps-ticket/ligne-status.ts";
import type { TicketFusionne } from "./delais.ts";

export const FICHIER_DES_FICHES = ".claude/brigade/delais-tickets.json";
export const FICHES_GARDEES = 200;

export type FicheDuTicket = { ticket: number; titre: string; etiquettes: string[] };

// Le contenu du fichier des fiches : absent, aucune ; illisible, l'appel lève.
function lireLesFiches(dossier: string): FicheDuTicket[] {
  const fichier = join(dossier, FICHIER_DES_FICHES);
  let texte: string;
  try {
    texte = readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erreur;
  }
  const lus: unknown = JSON.parse(texte);
  if (!Array.isArray(lus)) throw new Error(`${fichier} is not a JSON array`);
  return lus.filter((lu): lu is FicheDuTicket => typeof lu === "object" && lu !== null && Number.isInteger(lu.ticket) && typeof lu.titre === "string" && Array.isArray(lu.etiquettes));
}

// Écrit la fiche d'un ticket servi au fichier du clone `dossier` ; une fiche
// plus ancienne du même ticket est remplacée. Un fichier illisible n'est pas
// écrasé : l'appel lève.
export function retenirLaFiche(dossier: string, fiche: FicheDuTicket): void {
  const autres = lireLesFiches(dossier).filter((lue) => lue.ticket !== fiche.ticket);
  const fichier = join(dossier, FICHIER_DES_FICHES);
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, `${JSON.stringify([...autres, fiche].slice(-FICHES_GARDEES), null, 2)}\n`);
  renameSync(provisoire, fichier);
}

const ms = (instant: string) => Date.parse(instant);
const iso = (instant: number) => new Date(instant).toISOString();

// Le ticket mergé que dit un enregistrement du temps, avec sa fiche. La prise
// est celle que l'issue porte (`priseAt`), sinon la première marque de la
// station. Avec ses passages en pass : la PR s'ouvre au premier, les renvois
// vont du premier au dernier, les gates (CI comprise) et la relecture sont
// celles du dernier, la livraison mergée. Sans eux : la PR s'ouvre après ses
// cuissons, et gates, CI, relecture et renvois sont ses phases. Sans merge ni
// prise datés : null.
export function depuisLesTemps(temps: TempsTicket, fiche: FicheDuTicket | undefined): TicketFusionne | null {
  const priseAt = temps.priseAt ?? temps.claimedAt;
  if (priseAt === undefined || temps.mergedAt === undefined) return null;
  const etiquettes = fiche?.etiquettes ?? [];
  const { model, effort } = calibrage(etiquettes);
  const premier = temps.passes?.[0];
  const dernier = temps.passes?.at(-1);
  const parts =
    premier === undefined || dernier === undefined
      ? { prOuverteAt: iso(ms(priseAt) + (temps.cuisson + (temps.cuissonsRatees ?? 0)) * 1000), gatesMin: ((temps.gates ?? 0) + temps.ci) / 60, revueMin: temps.revue / 60, renvoisMin: (temps.renvois ?? 0) / 60 }
      : { prOuverteAt: premier.debut, gatesMin: (dernier.gates + dernier.ci) / 60, revueMin: dernier.revue / 60, renvoisMin: (ms(dernier.debut) - ms(premier.debut)) / 60_000 };
  return { ticket: temps.ticket, titre: fiche?.titre ?? "", etiquettes, modele: model ?? "?", effort: effort ?? "?", priseAt, fusionneAt: temps.mergedAt, ...parts };
}

// Les tickets mergés que le clone `repertoireDepot` connaît ; sans clone,
// aucun. Le fichier des fiches illisible : `illisible`, sa raison.
export function fusionnesDuClone(repertoireDepot: string | undefined): { tickets: TicketFusionne[] } | { illisible: string } {
  if (!repertoireDepot) return { tickets: [] };
  let fiches: FicheDuTicket[];
  try {
    fiches = lireLesFiches(repertoireDepot);
  } catch (erreur) {
    return { illisible: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  const parTicket = new Map(fiches.map((fiche) => [fiche.ticket, fiche]));
  return { tickets: lesTempsDesTickets(repertoireDepot).enregistrements.flatMap((temps) => depuisLesTemps(temps, parTicket.get(temps.ticket)) ?? []) };
}
