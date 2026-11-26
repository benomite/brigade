// Les événements des tickets mergés (#4299), tirés de la mesure que la station écrit à chaque merge dans
// `.claude/brigade/temps-tickets.json` (`temps-ticket/mesure.ts`) : la prise est la première « Taken by station »
// que l'issue porte sur GitHub (`priseAt`), ou, sans elle, la première phase que la station a vue (`claimedAt`) ;
// le merge est `mergedAt`. Les phases sont celles de l'enregistrement, posées bout à bout depuis `depuis`, et
// chacune rangée dans une des cinq parts. Un enregistrement d'avant #2662, sans `phases`, n'a que son temps.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NOMS_DES_ETAPES, ticketsDuFichier } from "../temps-ticket/mesure.ts";
import { lesTempsDesTickets, type TempsTicket } from "../temps-ticket/ligne-status.ts";
import type { Evenement, Part, Phase } from "./mesure.ts";

// Chaque phase de la mesure, par son nom, dans sa part. Une phase au nom inconnu est une attente.
const PART_DE_L_ETAPE: Record<string, Part> = {
  [NOMS_DES_ETAPES.cuisson]: "cook",
  [NOMS_DES_ETAPES.cuissonRatee]: "cook",
  [NOMS_DES_ETAPES.gates]: "gates",
  [NOMS_DES_ETAPES.ci]: "gates",
  [NOMS_DES_ETAPES.revue]: "review",
  [NOMS_DES_ETAPES.renvoi]: "send-back",
};

const instant = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);

function phasesDe(t: TempsTicket): Phase[] {
  const depuis = instant(t.depuis);
  if (depuis === null || !Array.isArray(t.phases)) return [];
  let debut = Date.parse(depuis);
  const phases: Phase[] = [];
  for (const { nom, minutes } of t.phases) {
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return [];
    const fin = debut + Math.round(minutes * 60_000);
    phases.push({ type: PART_DE_L_ETAPE[nom] ?? "wait", debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString() });
    debut = fin;
  }
  return phases;
}

// Les événements des enregistrements qui disent leur prise et leur merge.
export function evenementsDesTemps(enregistrements: readonly unknown[]): Evenement[] {
  return enregistrements.flatMap((brut) => {
    if (typeof brut !== "object" || brut === null) return [];
    const t = brut as TempsTicket;
    const pris = instant(t.priseAt) ?? instant(t.claimedAt);
    const fusionne = instant(t.mergedAt);
    if (!Number.isInteger(t.ticket) || pris === null || fusionne === null) return [];
    return [{ ticket: t.ticket, pris, fusionne, phases: phasesDe(t) }];
  });
}

// Les événements du clone du projet. Un fichier absent : aucun ticket mergé. Sans clone, ou un fichier présent
// qui ne se lit pas : null — rien n'est dit à sa place.
export function lireLesEvenements(repertoireDepot: string | undefined): Evenement[] | null {
  if (!repertoireDepot) return null;
  const fichier = join(repertoireDepot, ".claude", "brigade", "temps-tickets.json");
  if (!existsSync(fichier)) return [];
  try {
    if (ticketsDuFichier(JSON.parse(readFileSync(fichier, "utf8"))) === null) return null;
  } catch {
    return null;
  }
  return evenementsDesTemps(lesTempsDesTickets(repertoireDepot).enregistrements);
}
