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
//
// Les sites qui lancent ces runs — les gates, le sondage de la CI, les tests
// d'un cook — sont hors de ce module : chacun a son crochet, plus bas, qu'il
// appelle en une ligne avec ce qu'il a déjà dans les mains.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CoutDesGates } from "../gates.ts";
import { durationSeconds } from "../measures/ci-duration.ts";
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

// Ce que le fichier porte : les durées, et les commits dont la CI y est déjà
// — relue à chaque sondage, et de nouveau après un redémarrage, une CI finie
// ne compte qu'une fois.
type Contenu = { durees: Durees; ciVues: string[] };

// Le fichier des durées d'un projet, ou null s'il n'a nulle part où vivre.
export function fichierDesDurees(projet: string, { env = process.env }: Ou = {}): string | null {
  if (!NOM_DE_PROJET.test(projet)) return null;
  if (env.BRIGADE_STATION_DIR) return join(env.BRIGADE_STATION_DIR, ETATS, projet, FICHIER_DUREES);
  // Hors station, l'état du process n'est que celui de son projet.
  if (env.BRIGADE_STATE_DIR && env.BRIGADE_PROJECT === projet) return join(env.BRIGADE_STATE_DIR, FICHIER_DUREES);
  return null;
}

const duree = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0;

function lire(fichier: string): Contenu {
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch {
    // Absent ou illisible : rien de retenu.
    return { durees: vides(), ciVues: [] };
  }
  const durees = vides();
  if (lu === null || typeof lu !== "object") return { durees, ciVues: [] };
  const champs = lu as Record<string, unknown>;
  for (const genre of GENRES) {
    const valeurs = champs[genre];
    if (Array.isArray(valeurs)) durees[genre] = valeurs.filter(duree).slice(-DUREES_GARDEES);
  }
  const vues = Array.isArray(champs.ciVues) ? champs.ciVues.filter((sha): sha is string => typeof sha === "string") : [];
  return { durees, ciVues: vues.slice(-DUREES_GARDEES) };
}

let ecritures = 0;

// Écrit à côté puis renommé : un arrêt au milieu ne laisse pas un fichier
// tronqué. Le fichier d'à côté est propre à chaque écriture.
function ecrire(fichier: string, { durees, ciVues }: Contenu): void {
  mkdirSync(dirname(fichier), { recursive: true });
  const neuf = `${fichier}.${process.pid}.${++ecritures}.tmp`;
  writeFileSync(neuf, `${JSON.stringify(ciVues.length === 0 ? durees : { ...durees, ciVues })}\n`);
  renameSync(neuf, fichier);
}

// Les durées retenues pour ce projet, par genre, la plus récente en dernier.
export function lireDurees(projet: string, ou: Ou = {}): Durees {
  const fichier = fichierDesDurees(projet, ou);
  return fichier === null ? vides() : lire(fichier).durees;
}

// Retient la durée d'un run de ce projet. Ne lève pas : un run ne doit rien
// au relevé de sa durée. Rend false si elle n'a pas été retenue — durée ou
// genre invalides, projet sans état, fichier impossible à écrire.
export function enregistrerDuree(projet: string, genre: Genre, secondes: number, ou: Ou = {}): boolean {
  return retenir(projet, genre, secondes, null, ou);
}

// Lecture, ajout et écriture d'un seul tenant, sans rien attendre entre les
// trois : dans le process, deux relevés ne se perdent pas l'un l'autre.
// `sha` : le commit d'une CI, qui n'est retenue qu'une fois.
function retenir(projet: string, genre: Genre, secondes: number, sha: string | null, ou: Ou): boolean {
  if (!GENRES.includes(genre) || !duree(secondes)) return false;
  const fichier = fichierDesDurees(projet, ou);
  if (fichier === null) return false;
  try {
    const contenu = lire(fichier);
    if (sha !== null && contenu.ciVues.includes(sha)) return false;
    contenu.durees[genre] = [...contenu.durees[genre], secondes].slice(-DUREES_GARDEES);
    if (sha !== null) contenu.ciVues = [...contenu.ciVues, sha].slice(-DUREES_GARDEES);
    ecrire(fichier, contenu);
    return true;
  } catch {
    return false;
  }
}

// Les crochets. Aucun ne lève, et chacun rend ce que rend `enregistrerDuree`.

// Un run entre deux instants — des tests qu'un cook a lancés, de leur appel
// d'outil à son résultat. Un instant illisible, ou une fin avant le début, ne
// s'écrit pas.
export function noterDureeEntre(projet: string, genre: Genre, debut: Date | string | number, fin: Date | string | number, ou: Ou = {}): boolean {
  const de = new Date(debut).getTime();
  const a = new Date(fin).getTime();
  return enregistrerDuree(projet, genre, (a - de) / 1000, ou);
}

// Un passage des gates, avec ce qu'il a coûté (`jouerGatesMesurees`, le reçu
// d'un cook) : l'horloge de leur script, setup à part. Sans coût — le setup a
// échoué, les gates n'ont pas tourné —, rien.
export function noterDureeDesGates(projet: string, cout: CoutDesGates | null, ou: Ou = {}): boolean {
  if (cout === null) return false;
  return enregistrerDuree(projet, "gates", cout.durationMs / 1000, ou);
}

// Le run de CI d'un commit, une fois fini : du début de son premier job à la
// fin du dernier, comme `measures` la compte. Les jobs sont ceux que GitHub
// rend (`check-runs`). Tant qu'un job n'est pas fini, ou si la CI de ce commit
// est déjà retenue, rien.
export type JobDeCI = { started_at?: string | null; completed_at?: string | null };
export function noterDureeDeLaCi(projet: string, sha: string, jobs: JobDeCI[], ou: Ou = {}): boolean {
  if (sha === "" || jobs.length === 0 || jobs.some((job) => !job.completed_at)) return false;
  const secondes = durationSeconds(jobs.map((job) => ({ started_at: job.started_at ?? null, completed_at: job.completed_at ?? null })));
  return secondes !== null && retenir(projet, "ci", secondes, sha, ou);
}
