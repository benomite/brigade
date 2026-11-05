// Ce que durent, projet par projet, ses runs de CI, ses gates et ses tests
// (#2348) : brigade ne les écrit pas, mais la station retient combien de temps
// chacun a pris, pour que la lenteur d'un projet se voie. Les durées sont en
// secondes, la plus récente en dernier, et seules les 200 dernières de chaque
// genre sont gardées.
//
// Elles vivent à côté du reste de l'état du projet sur la station :
// `<BRIGADE_STATION_DIR>/etat/<projet>/durees.json`. Sans répertoire de station
// (le poste de dev), dans `BRIGADE_STATE_DIR` du projet que ce process sert ;
// sans l'un ni l'autre, rien n'est retenu. Chaque lecture relit le fichier :
// rien ne reste en mémoire, un redémarrage de la station ne perd rien.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NOM_DE_PROJET } from "../runtime.ts";
import { ETATS } from "../station/configuration.ts";

export const GENRES = ["ci", "gates", "tests"] as const;
export type Genre = (typeof GENRES)[number];
export type Durees = Record<Genre, number[]>;

export const DUREES_GARDEES = 200;
export const FICHIER_DUREES = "durees.json";

// D'où lire la station et le projet du process ; `process.env` par défaut.
export type Ou = { env?: Record<string, string | undefined> };

const vides = (): Durees => ({ ci: [], gates: [], tests: [] });

// Le fichier des durées d'un projet, ou null s'il n'a nulle part où vivre.
export function fichierDesDurees(projet: string, { env = process.env }: Ou = {}): string | null {
  if (!NOM_DE_PROJET.test(projet)) return null;
  if (env.BRIGADE_STATION_DIR) return join(env.BRIGADE_STATION_DIR, ETATS, projet, FICHIER_DUREES);
  // Hors station, l'état du process n'est que celui de son projet.
  if (env.BRIGADE_STATE_DIR && env.BRIGADE_PROJECT === projet) return join(env.BRIGADE_STATE_DIR, FICHIER_DUREES);
  return null;
}

const duree = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0;

function lire(fichier: string): Durees {
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch {
    // Absent ou illisible : rien de retenu.
    return vides();
  }
  const durees = vides();
  if (lu === null || typeof lu !== "object") return durees;
  for (const genre of GENRES) {
    const valeurs = (lu as Record<string, unknown>)[genre];
    if (Array.isArray(valeurs)) durees[genre] = valeurs.filter(duree).slice(-DUREES_GARDEES);
  }
  return durees;
}

// Les durées retenues pour ce projet, par genre, la plus récente en dernier.
export function lireDurees(projet: string, ou: Ou = {}): Durees {
  const fichier = fichierDesDurees(projet, ou);
  return fichier === null ? vides() : lire(fichier);
}

// Retient la durée d'un run de ce projet. Ne lève pas : un run ne doit rien
// au relevé de sa durée. Rend false si elle n'a pas été retenue — durée ou
// genre invalides, projet sans état, fichier impossible à écrire.
export function enregistrerDuree(projet: string, genre: Genre, secondes: number, ou: Ou = {}): boolean {
  if (!GENRES.includes(genre) || !duree(secondes)) return false;
  const fichier = fichierDesDurees(projet, ou);
  if (fichier === null) return false;
  try {
    const durees = lire(fichier);
    durees[genre] = [...durees[genre], secondes].slice(-DUREES_GARDEES);
    mkdirSync(dirname(fichier), { recursive: true });
    // Écrit à côté puis renommé : un arrêt au milieu ne laisse pas un fichier tronqué.
    const neuf = `${fichier}.${process.pid}.tmp`;
    writeFileSync(neuf, `${JSON.stringify(durees)}\n`);
    renameSync(neuf, fichier);
    return true;
  } catch {
    return false;
  }
}
