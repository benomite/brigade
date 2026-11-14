// La CI d'une livraison telle que GitHub Actions la dit (#3512) : pour chaque
// passage en pass, le temps où sa CI attendait un runner, celui où elle
// tournait, et les runs relancés parce que la branche a bougé. Fonctions
// pures : la station lit les runs de la branche au merge (`ciDeLaBranche` de
// `github.ts`) et les donne ici.
//
// Un job attend un runner de sa création (`created_at`) à son départ
// (`started_at`) ; il tourne de son départ à sa fin (`completed_at`). Un
// instant du passage compte pour l'attente tant qu'au moins un job de la
// branche attend un runner, pour la course quand des jobs tournent et
// qu'aucun n'attend : les deux ne se recouvrent pas, et leur somme est le
// temps où la CI de la branche existait pendant le passage.
//
// Un run est relancé parce que la branche a bougé quand un run d'une autre
// tête de la branche est créé après lui, avant qu'il ne finisse : le run de la
// tête d'avant est annulé, ou tourne pour rien. Il compte au passage pendant
// lequel il a été créé — ou au suivant, s'il l'a été pendant un cook.
import type { Passage } from "./synthese.ts";

type JobDeCi = { creeLe: string; commenceLe: string | null; finiLe: string | null };
export type RunDeCi = { tete: string; creeLe: string; finiLe: string | null; jobs: JobDeCi[] };

type Intervalle = [number, number];

// La longueur de la réunion d'intervalles, coupés à [debut, fin], en millisecondes.
function reunion(intervalles: readonly Intervalle[], debut: number, fin: number): Intervalle[] {
  const coupes = intervalles
    .map(([de, a]): Intervalle => [Math.max(de, debut), Math.min(a, fin)])
    .filter(([de, a]) => a > de)
    .sort((x, y) => x[0] - y[0]);
  const reunis: Intervalle[] = [];
  for (const [de, a] of coupes) {
    const dernier = reunis.at(-1);
    if (dernier !== undefined && de <= dernier[1]) dernier[1] = Math.max(dernier[1], a);
    else reunis.push([de, a]);
  }
  return reunis;
}

const longueur = (intervalles: readonly Intervalle[]) => intervalles.reduce((somme, [de, a]) => somme + (a - de), 0);

// La part de `b` hors de `a`, deux réunions triées.
function horsDe(b: readonly Intervalle[], a: readonly Intervalle[]): number {
  let reste = longueur(b);
  for (const [de, fin] of b) for (const [x, y] of a) reste -= Math.max(0, Math.min(fin, y) - Math.max(de, x));
  return reste;
}

const instant = (iso: string | null | undefined) => (iso === null || iso === undefined ? Number.NaN : Date.parse(iso));

// Chaque passage, avec ce que sa CI a fait sur GitHub (`ciGitHub`), en secondes.
// Un job dont un instant ne se lit pas est écarté ; un job pas fini court
// jusqu'à la fin du passage.
export function partagerLaCi(runs: readonly RunDeCi[], passes: readonly Passage[]): Passage[] {
  const attentes: Intervalle[] = [];
  const courses: Intervalle[] = [];
  for (const run of runs) {
    for (const job of run.jobs) {
      const cree = instant(job.creeLe);
      if (Number.isNaN(cree)) continue;
      const commence = instant(job.commenceLe);
      const fini = instant(job.finiLe);
      const finDuJob = Number.isNaN(fini) ? Number.POSITIVE_INFINITY : fini;
      attentes.push([cree, Number.isNaN(commence) ? finDuJob : commence]);
      if (!Number.isNaN(commence)) courses.push([commence, finDuJob]);
    }
  }
  // Les runs relancés parce que la branche a bougé, chacun par l'instant de sa création.
  const relances = runs
    .filter((run) => {
      const cree = instant(run.creeLe);
      const fini = instant(run.finiLe);
      const finDuRun = Number.isNaN(fini) ? Number.POSITIVE_INFINITY : fini;
      return !Number.isNaN(cree) && runs.some((autre) => autre.tete !== run.tete && instant(autre.creeLe) > cree && instant(autre.creeLe) < finDuRun);
    })
    .map((run) => instant(run.creeLe));
  return passes.map((passage, rang) => {
    const debut = instant(passage.debut);
    const fin = instant(passage.fin);
    if (Number.isNaN(debut) || Number.isNaN(fin)) return passage;
    const attend = reunion(attentes, debut, fin);
    const tourne = reunion(courses, debut, fin);
    const precedente = rang === 0 ? Number.NEGATIVE_INFINITY : instant(passes[rang - 1]?.fin);
    const relancees = relances.filter((cree) => cree > precedente && cree <= fin).length;
    return { ...passage, ciGitHub: { attente: Math.round(longueur(attend) / 1000), course: Math.round(horsDe(tourne, attend) / 1000), relancees } };
  });
}
