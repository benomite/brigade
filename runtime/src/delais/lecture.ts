// Ce que les temps des tickets mergés (#4308) lisent, sans rien demander à
// GitHub : les événements des tickets mergés que lit déjà #4299
// (`evenements.ts`, tirés de `.claude/brigade/temps-tickets.json` — la prise
// lue sur GitHub, « Taken by station », et les phases), et, à côté, la
// fiche que la station écrit au même moment : son titre et ses labels
// (`delais-tickets.json`). Un ticket mergé avant cette fiche n'a ni titre ni
// label : il compte sans temps attendu.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { calibrage } from "../calibrage.ts";
import { calculerLesDelais, type Delais, type TicketFusionne } from "./delais.ts";
import { lireLesEvenements } from "./evenements.ts";
import { decomposer, type Evenement } from "./mesure.ts";

const FICHIER_DES_FICHES = ".claude/brigade/delais-tickets.json";
const FICHES_GARDEES = 200;

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

// Le ticket mergé que dit un événement du clone (`evenements.ts`, #4299), avec sa fiche : ses parts sont celles
// que le commentaire des tickets lents dit (`decomposer`) — la PR s'ouvre après la part du cook.
function depuisLEvenement(e: Evenement, fiche: FicheDuTicket | undefined): TicketFusionne {
  const { parts } = decomposer(e);
  const etiquettes = fiche?.etiquettes ?? [];
  const { model, effort } = calibrage(etiquettes);
  const prOuverteAt = new Date(Date.parse(e.pris) + parts.cook * 60_000).toISOString();
  return { ticket: e.ticket, titre: fiche?.titre ?? "", etiquettes, modele: model ?? "?", effort: effort ?? "?", priseAt: e.pris, prOuverteAt, fusionneAt: e.fusionne, gatesMin: parts.gates, revueMin: parts.review, renvoisMin: parts["send-back"] };
}

// Les tickets mergés que le clone `repertoireDepot` connaît ; sans clone,
// aucun. Le fichier des temps ou celui des fiches illisible : `illisible`, sa raison.
function fusionnesDuClone(repertoireDepot: string | undefined): { tickets: TicketFusionne[] } | { illisible: string } {
  if (!repertoireDepot) return { tickets: [] };
  let fiches: FicheDuTicket[];
  try {
    fiches = lireLesFiches(repertoireDepot);
  } catch (erreur) {
    return { illisible: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  const evenements = lireLesEvenements(repertoireDepot);
  if (evenements === null) return { illisible: "the ticket times of the clone cannot be read" };
  const parTicket = new Map(fiches.map((fiche) => [fiche.ticket, fiche]));
  return { tickets: evenements.map((e) => depuisLEvenement(e, parTicket.get(e.ticket))) };
}

// Les délais des tickets mergés que le clone connaît, à `maintenant` ; son
// fichier des fiches illisible : `illisible`, sa raison, rien de calculé.
export function delaisDuClone(repertoireDepot: string | undefined, maintenant: Date): Delais | { illisible: string } {
  const lus = fusionnesDuClone(repertoireDepot);
  return "illisible" in lus ? lus : calculerLesDelais(lus.tickets, maintenant);
}
