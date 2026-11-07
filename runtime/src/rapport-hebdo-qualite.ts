// Le rapport hebdomadaire de qualité du second au chef (épique #2673) : la part
// des tickets récents dans leurs seuils de temps, la part livrée du premier
// coup et les réparations de la base par PR mergée ; et, si les seuils ne
// tiennent qu'en baissant la qualité, une proposition de seuils qui ne
// s'appuient pas dessus.
//
// « Ne tenir qu'en baissant la qualité » : la part dans les seuils a monté ou
// reste haute, alors que le premier coup ou les réparations ont empiré sur les
// mêmes semaines (celles du fichier d'historique). Sinon, aucune proposition.
//
// Un rapport par semaine ISO (UTC) : le fichier `rapport-hebdo-qualite.json` de
// `.claude/brigade/` garde la semaine du dernier envoi et les chiffres des
// dernières semaines. Rien n'est écrit si l'envoi échoue, le rapport repart
// alors au prochain passage. Le second appelle `rapportHebdomadaire` à chaque
// passage périodique ; `envoyer` est ce qui porte le texte au chef.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { maxDuProjet, dureeDuTicket, ticketsRecents } from "./temps-max/mesure.ts";
import { mesurerQualite, partDansLesSeuils, type QualiteDuTicket } from "./mesure-qualite.ts";
import type { TempsTicket } from "./temps-ticket/ligne-status.ts";

export const FICHIER_DU_RAPPORT = ".claude/brigade/rapport-hebdo-qualite.json";
export const SEMAINES_GARDEES = 8;
// La part dans les seuils qui compte comme haute.
export const PART_HAUTE = 0.8;
// De combien le premier coup (points de part) ou les réparations par merge doivent empirer pour compter.
export const BAISSE_DU_PREMIER_COUP = 0.05;
export const HAUSSE_DES_REPARATIONS = 0.05;

export type ChiffresDeSemaine = { semaine: string; dansLesSeuils: number | null; premierCoup: number | null; reparationsParMerge: number | null };
type Etat = { semaine: string; historique: ChiffresDeSemaine[] };

// La semaine ISO (lundi à dimanche, UTC) de l'instant : « 2026-W45 ».
export function semaineDe(instant: Date): string {
  const jour = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
  jour.setUTCDate(jour.getUTCDate() + 4 - (jour.getUTCDay() || 7));
  const debut = Date.UTC(jour.getUTCFullYear(), 0, 1);
  const numero = Math.ceil(((jour.getTime() - debut) / 86_400_000 + 1) / 7);
  return `${jour.getUTCFullYear()}-W${String(numero).padStart(2, "0")}`;
}

const pour100 = (x: number | null) => (x === null ? "unknown" : `${Math.round(x * 100)}%`);

// Les seuils ne tiennent qu'en baissant la qualité : comparés à la plus
// ancienne semaine gardée, la part dans les seuils a monté ou reste haute, et
// le premier coup ou les réparations ont empiré. Faux sans chiffre à comparer.
export function seuilsTenusEnBaissantLaQualite(avant: ChiffresDeSemaine | undefined, maintenant: ChiffresDeSemaine): string[] {
  if (avant === undefined || maintenant.dansLesSeuils === null) return [];
  const tient = maintenant.dansLesSeuils >= PART_HAUTE || (avant.dansLesSeuils !== null && maintenant.dansLesSeuils >= avant.dansLesSeuils);
  if (!tient) return [];
  const pires: string[] = [];
  if (avant.premierCoup !== null && maintenant.premierCoup !== null && avant.premierCoup - maintenant.premierCoup >= BAISSE_DU_PREMIER_COUP) {
    pires.push(`the first-try rate fell from ${pour100(avant.premierCoup)} to ${pour100(maintenant.premierCoup)}`);
  }
  if (avant.reparationsParMerge !== null && maintenant.reparationsParMerge !== null && maintenant.reparationsParMerge - avant.reparationsParMerge >= HAUSSE_DES_REPARATIONS) {
    pires.push(`repairs of main per merged PR rose from ${avant.reparationsParMerge.toFixed(2)} to ${maintenant.reparationsParMerge.toFixed(2)}`);
  }
  return pires;
}

function propositionDeSeuils(temps: readonly TempsTicket[], maxMin: number, avant: ChiffresDeSemaine, maintenant: ChiffresDeSemaine, pires: string[]): string[] {
  const plusLent = Math.max(0, ...ticketsRecents(temps).map((t) => dureeDuTicket(t) / 60));
  const lignes = [
    "",
    "Threshold proposal",
    `Why: ${pour100(maintenant.dansLesSeuils)} of recent tickets are within their time threshold (${pour100(avant.dansLesSeuils)} before), but ${pires.join(" and ")} over the same weeks: the time thresholds only hold by lowering quality.`,
    `Proposed: raise tempsMaxTicketMin from ${maxMin} to ${Math.max(maxMin, Math.ceil(plusLent))} min (the slowest recent ticket), so no ticket is rushed to fit, and hold the quality floors where they were:`,
  ];
  if (avant.premierCoup !== null) lignes.push(`- premierCoupMinPourcent: ${Math.floor((avant.premierCoup * 100) / 5) * 5}`);
  if (avant.reparationsParMerge !== null) lignes.push(`- repairs of main per merged PR: at most ${Math.max(avant.reparationsParMerge, 0.1).toFixed(2)}`);
  return lignes;
}

export function texteDuRapport(semaine: string, temps: readonly TempsTicket[], qualites: ReadonlyMap<number, QualiteDuTicket>, projet: unknown, historique: readonly ChiffresDeSemaine[]): { texte: string; chiffres: ChiffresDeSemaine } {
  const maxMin = maxDuProjet(projet);
  const q = mesurerQualite(temps, qualites, projet);
  const chiffres: ChiffresDeSemaine = { semaine, dansLesSeuils: partDansLesSeuils(temps, maxMin), premierCoup: q.premierCoup, reparationsParMerge: q.reparationsParMerge };
  const lignes = [
    `Weekly quality report — ${semaine}`,
    `- Tickets within their time thresholds (max ${maxMin} min): ${pour100(chiffres.dansLesSeuils)} of the ${q.tickets.length} recent tickets`,
    `- First-try rate: ${pour100(q.premierCoup)} (floor ${q.seuilPremierCoup}%)`,
    `- Repairs of main per merged PR: ${q.reparationsParMerge === null ? "unknown" : q.reparationsParMerge.toFixed(2)}`,
  ];
  const pires = seuilsTenusEnBaissantLaQualite(historique[0], chiffres);
  const avant = historique[0];
  if (pires.length > 0 && avant !== undefined) lignes.push(...propositionDeSeuils(temps, maxMin, avant, chiffres, pires));
  return { texte: lignes.join("\n"), chiffres };
}

function lireEtat(fichier: string): Etat | null {
  try {
    const brut: unknown = JSON.parse(readFileSync(fichier, "utf8"));
    const e = brut as Partial<Etat> | null;
    return typeof e?.semaine === "string" && Array.isArray(e.historique) ? { semaine: e.semaine, historique: e.historique } : null;
  } catch {
    return null;
  }
}

export type EntreesDuRapport = {
  dossier: string;
  temps: readonly TempsTicket[];
  qualites: ReadonlyMap<number, QualiteDuTicket>;
  projet?: unknown;
  maintenant: Date;
  envoyer: (texte: string) => void;
};

// Envoie le rapport de la semaine s'il n'est pas déjà parti cette semaine.
// Rend le texte envoyé, ou null (déjà envoyé).
export function rapportHebdomadaire({ dossier, temps, qualites, projet, maintenant, envoyer }: EntreesDuRapport): string | null {
  const fichier = join(dossier, FICHIER_DU_RAPPORT);
  const semaine = semaineDe(maintenant);
  const etat = lireEtat(fichier);
  if (etat?.semaine === semaine) return null;
  const historique = (etat?.historique ?? []).filter((h) => h.semaine !== semaine);
  const { texte, chiffres } = texteDuRapport(semaine, temps, qualites, projet, historique);
  envoyer(texte);
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, `${JSON.stringify({ semaine, historique: [...historique, chiffres].slice(-SEMAINES_GARDEES) }, null, 2)}\n`);
  renameSync(provisoire, fichier);
  return texte;
}
