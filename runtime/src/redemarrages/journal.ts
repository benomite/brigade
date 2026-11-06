// Les redémarrages de la station : un petit journal (`<BRIGADE_STATION_DIR>/redemarrages.json`),
// une entrée par démarrage — l'instant et la version. On ne garde que les 24 dernières
// heures plus une marge ; `status` en compte les dernières 24 heures (#2589).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FICHIER = "redemarrages.json";
const JOUR_MS = 86_400_000;
const MARGE_MS = 3_600_000;

export type Redemarrage = { a: number; version: string };

function lire(racine: string | undefined): Redemarrage[] {
  if (!racine) return [];
  try {
    const lu: unknown = JSON.parse(readFileSync(join(racine, FICHIER), "utf8"));
    if (!Array.isArray(lu)) return [];
    return lu.filter((e): e is Redemarrage => typeof e?.a === "number" && Number.isFinite(e.a) && typeof e.version === "string");
  } catch {
    return [];
  }
}

// Ne lève jamais : un journal qui ne s'écrit pas ne doit pas empêcher la station de démarrer.
export function noterUnDemarrage(racine: string, version: string, maintenant: number = Date.now()): void {
  try {
    const gardes = lire(racine).filter((e) => e.a > maintenant - JOUR_MS - MARGE_MS);
    gardes.push({ a: maintenant, version });
    mkdirSync(racine, { recursive: true });
    const temporaire = join(racine, `${FICHIER}.tmp`);
    writeFileSync(temporaire, JSON.stringify(gardes));
    renameSync(temporaire, join(racine, FICHIER));
  } catch {
    // rien à faire de plus
  }
}

// Journal absent ou illisible : 0.
export function redemarragesDes24h(racine: string | undefined, maintenant: number = Date.now()): number {
  return lire(racine).filter((e) => e.a > maintenant - JOUR_MS && e.a <= maintenant).length;
}

export const ligneDesRedemarrages = (racine: string | undefined, maintenant: number = Date.now()): string => `Restarts (24h): ${redemarragesDes24h(racine, maintenant)}`;
