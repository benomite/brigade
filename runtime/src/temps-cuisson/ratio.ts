// Le rapport de la cuisson réelle d'un ticket servi à celle que son
// estimation attendait (#2675, épique #2671).
//
// L'estimation vient du label `time:<minutes>` que le manager pose au
// découpage ; la cuisson réelle, du temps du ticket mesuré à son merge
// (`temps-ticket/mesure.ts`, en secondes). Au service, `servirLeTemps` écrit
// le temps du ticket comme avant, puis son rapport à côté, dans
// `.claude/brigade/ratios-cuisson.json` du projet. Seuls les 200 derniers
// sont gardés, le même ticket n'y est qu'une fois.
//
// Un ticket sans label valide — qualifié avant ce label, ou à la main — n'a
// pas de rapport, et ce n'est pas une erreur : son temps s'écrit, et compte,
// exactement comme avant.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { enregistrerTemps } from "../temps-ticket/mesure.ts";
import type { EnregistrementTemps } from "../temps-ticket/synthese.ts";

export const FICHIER_DES_RATIOS = ".claude/brigade/ratios-cuisson.json";
export const RATIOS_GARDES = 200;
export const NOMBRE_DE_RATIOS_RECENTS = 10;

// Le rapport d'un ticket servi : les minutes attendues, les minutes de sa
// cuisson réelle, et réelles / attendues. `servedAt` : son merge (ISO).
export type RatioDeCuisson = { ticket: number; servedAt: string; attendu: number; reel: number; ratio: number };

const LABEL_DU_TEMPS = /^time:(\d+)$/;

// Les minutes attendues d'un ticket, lues de son label `time:<minutes>` : un
// entier strictement positif. Sans label, ou mal formé (`time:abc`, `time:0`),
// ou plusieurs qui se contredisent : null.
export function minutesAttendues(labels: readonly string[]): number | null {
  const lues = new Set(labels.flatMap((label) => LABEL_DU_TEMPS.exec(label)?.[1] ?? []).map(Number));
  const [minutes] = lues;
  return lues.size === 1 && minutes !== undefined && Number.isSafeInteger(minutes) && minutes > 0 ? minutes : null;
}

// Le rapport du ticket dont le temps vient d'être mesuré, ou null sans
// estimation.
export function ratioDuServi(enregistrement: EnregistrementTemps, labels: readonly string[]): RatioDeCuisson | null {
  const attendu = minutesAttendues(labels);
  if (attendu === null || !Number.isFinite(enregistrement.cuisson) || enregistrement.cuisson < 0) return null;
  const reel = enregistrement.cuisson / 60;
  return { ticket: enregistrement.ticket, servedAt: enregistrement.mergedAt, attendu, reel, ratio: reel / attendu };
}

const fichierDe = (dossier: string) => join(dossier, FICHIER_DES_RATIOS);

function lireBrut(fichier: string): string | undefined {
  try {
    return readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") throw erreur;
    return undefined;
  }
}

// Ajoute le rapport au fichier du projet dont `dossier` est la racine ; un
// rapport plus ancien du même ticket est remplacé. Un fichier illisible n'est
// pas écrasé : l'appel lève.
export function enregistrerRatio(dossier: string, ratio: RatioDeCuisson): void {
  const fichier = fichierDe(dossier);
  const texte = lireBrut(fichier);
  const lus: unknown = texte === undefined || texte.trim() === "" ? [] : JSON.parse(texte);
  if (!Array.isArray(lus)) throw new Error(`${fichier} is not a JSON array: it is left as is`);
  const autres = lus.filter((lu) => typeof lu !== "object" || lu === null || (lu as { ticket?: unknown }).ticket !== ratio.ticket);
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, `${JSON.stringify([...autres, ratio].slice(-RATIOS_GARDES), null, 2)}\n`);
  renameSync(provisoire, fichier);
}

// Le service d'un ticket : son temps s'écrit comme avant (`enregistrerTemps`),
// puis son rapport, s'il a une estimation. Rend le rapport écrit, ou null.
export function servirLeTemps(dossier: string, enregistrement: EnregistrementTemps, labels: readonly string[]): RatioDeCuisson | null {
  enregistrerTemps(dossier, enregistrement);
  const ratio = ratioDuServi(enregistrement, labels);
  if (ratio !== null) enregistrerRatio(dossier, ratio);
  return ratio;
}

function estUnRatio(x: unknown): x is RatioDeCuisson {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  const nombre = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  return nombre(e.ticket) && typeof e.servedAt === "string" && !Number.isNaN(Date.parse(e.servedAt)) && nombre(e.attendu) && (e.attendu as number) > 0 && nombre(e.reel) && nombre(e.ratio);
}

// Les rapports des derniers tickets servis du projet, le plus récent d'abord
// (par `servedAt`), au plus `combien`. Sans fichier, ou illisible : aucun.
// Les entrées qui n'ont pas la forme attendue sont écartées.
export function ratiosRecents(dossier: string, combien: number = NOMBRE_DE_RATIOS_RECENTS): RatioDeCuisson[] {
  const texte = lireBrut(fichierDe(dossier));
  if (texte === undefined) return [];
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return [];
  }
  if (!Array.isArray(brut)) return [];
  return brut
    .filter(estUnRatio)
    .sort((a, b) => Date.parse(b.servedAt) - Date.parse(a.servedAt))
    .slice(0, Math.max(0, combien));
}
