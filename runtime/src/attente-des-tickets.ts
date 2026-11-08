// Ce que la mesure attend avant de rouvrir (#2868) : après un ticket de qualité
// ou de temps perdu servi, rien ne s'ouvre avant 20 tickets pris et mergés après
// son merge. La station écrit son attente à chaque tour de la correction, `status`
// la lit — il ne lit pas GitHub. Une attente finie (ou jamais commencée) n'écrit rien.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DecisionDeCorrection } from "./temps-max/correction.ts";

export const FICHIER_DES_ATTENTES = "attente-des-tickets.json";

export type Attente = { manque: number; dernier: number };
export type Attentes = { qualite: Attente | null; tempsPerdu: Attente | null };

// L'attente que dit la décision de ce tour.
export function attentesDeLaDecision(decision: DecisionDeCorrection): Attentes {
  const qualite = decision.issue === "qualite" && decision.qualite.issue === "en-attente" ? { manque: decision.qualite.manque, dernier: decision.qualite.numero } : null;
  const tempsPerdu = decision.issue === "a-l-essai" ? { manque: decision.manque, dernier: decision.numero } : null;
  return { qualite, tempsPerdu };
}

export function noterLesAttentes(repertoireEtat: string, attentes: Attentes): void {
  const chemin = join(repertoireEtat, FICHIER_DES_ATTENTES);
  mkdirSync(repertoireEtat, { recursive: true });
  writeFileSync(`${chemin}.tmp`, JSON.stringify(attentes));
  renameSync(`${chemin}.tmp`, chemin);
}

const attente = (v: unknown): Attente | null => {
  if (typeof v !== "object" || v === null) return null;
  const { manque, dernier } = v as Record<string, unknown>;
  return Number.isInteger(manque) && (manque as number) > 0 && Number.isInteger(dernier) && (dernier as number) > 0 ? { manque: manque as number, dernier: dernier as number } : null;
};

// Les attentes notées ; aucune quand le fichier manque ou ne se lit pas.
export function lireLesAttentes(repertoireEtat: string | undefined): Attentes {
  if (!repertoireEtat) return { qualite: null, tempsPerdu: null };
  try {
    const lu: unknown = JSON.parse(readFileSync(join(repertoireEtat, FICHIER_DES_ATTENTES), "utf8"));
    const o = typeof lu === "object" && lu !== null ? (lu as Record<string, unknown>) : {};
    return { qualite: attente(o.qualite), tempsPerdu: attente(o.tempsPerdu) };
  } catch {
    return { qualite: null, tempsPerdu: null };
  }
}

// Les lignes de `status` : une par attente en cours, aucune sinon.
export function direLesAttentes(attentes: Attentes): string[] {
  const ligne = (nom: string, a: Attente | null) => (a === null ? [] : [`${nom}: waiting for ${a.manque} more merged tickets since #${a.dernier}`]);
  return [...ligne("quality", attentes.qualite), ...ligne("lost time", attentes.tempsPerdu)];
}
