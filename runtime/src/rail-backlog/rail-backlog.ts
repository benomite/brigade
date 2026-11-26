// Le rail est le haut du backlog (#4223, épique #4131 ; règle 2 de docs/superpowers/specs/2026-11-24-simplified-process.md) :
// une seule file, le backlog, rangée par priorité puis par âge ; le rail en montre les N premières issues calibrées et
// prêtes. Aucun geste du chef n'y met une issue : être calibrée et prête suffit.
//
// Calibrée : elle porte un `model:` et un `effort:` valides (calibrage.ts). Prête : elle porte `fire`, et rien qui la tienne hors de la
// file — une `idea`, jamais prise ; une issue parquée, qui attend quelqu'un ; une issue que le manager a écartée
// (attente-du-rail/stations.ts, `LABELS_D_ECART`). La priorité est le `prio:<n>` de ses labels : sans label, elle passe
// après les autres ; à priorité égale, la plus ancienne d'abord.
//
// Ce module ne lit rien et n'importe rien de lourd : l'app le charge dans son process principal (vue/rail/github.ts), où
// la lecture du rail ne joint ni box ni journal (app/test/tableau/read.test.ts). Il redit donc la priorité
// (alimenter.ts, `priorite`) sans l'importer — alimenter.ts tire le journal avec lui ; un test les joue toutes deux sur les
// mêmes labels (test/rail-backlog/rail-backlog.test.ts).
import { LABELS_D_ECART } from "../attente-du-rail/stations.ts";
import { calibrage, complet } from "../calibrage.ts";
import { estParque } from "../github-etat/etats.ts";

// Une issue ouverte du backlog, telle que GitHub la porte.
export type IssueDuBacklog = { number: number; title: string; labels: readonly string[]; createdAt: string };

// Combien d'issues le rail montre, par défaut.
const TAILLE_DU_RAIL = 10;

const LABEL_FIRE = "fire";
// Ce qui tient une issue hors de la file, en plus des écarts du manager : sortie de la cuisine (`out-of-kitchen`). Une
// issue parquée l'est aussi (`estParque`, github-etat/etats.ts, #4260).
const HORS_DE_LA_FILE: readonly string[] = [...LABELS_D_ECART, "out-of-kitchen"];

function estCalibree({ labels }: IssueDuBacklog): boolean {
  return complet(calibrage([...labels]));
}

// `prio:0` à `prio:9`, la plus forte si plusieurs ; null sans aucune.
export function prioriteDe(labels: readonly string[]): number | null {
  const niveaux = labels.flatMap((label) => /^prio:([0-9])$/.exec(label)?.[1] ?? []).map(Number);
  return niveaux.length === 0 ? null : Math.min(...niveaux);
}

function estPrete({ labels }: IssueDuBacklog): boolean {
  return labels.includes(LABEL_FIRE) && !estParque(labels) && !labels.some((label) => HORS_DE_LA_FILE.includes(label));
}

// L'âge d'une issue : l'instant de sa création ; illisible, elle passe après celles qui en ont un.
const creeeLe = ({ createdAt }: IssueDuBacklog): number => {
  const le = Date.parse(createdAt);
  return Number.isNaN(le) ? Number.POSITIVE_INFINITY : le;
};
const rang = (issue: IssueDuBacklog): number => prioriteDe(issue.labels) ?? Number.POSITIVE_INFINITY;

function avant(a: IssueDuBacklog, b: IssueDuBacklog): number {
  if (rang(a) !== rang(b)) return rang(a) < rang(b) ? -1 : 1;
  if (creeeLe(a) !== creeeLe(b)) return creeeLe(a) < creeeLe(b) ? -1 : 1;
  return a.number - b.number;
}

// Les N premières issues calibrées et prêtes du backlog, dans l'ordre priorité puis âge.
export function topDuBacklog<T extends IssueDuBacklog>(backlog: readonly T[], n: number = TAILLE_DU_RAIL): T[] {
  return backlog.filter((issue) => estCalibree(issue) && estPrete(issue)).sort(avant).slice(0, Math.max(0, n));
}

// Le rail d'un backlog qui change : chaque `rafraichir` relit le backlog tel que GitHub le porte à cet instant, et en
// rend le haut — une priorité que le chef a changée range le rail au rafraîchissement suivant.
export function railDuBacklog<T extends IssueDuBacklog>(lire: () => readonly T[], n: number = TAILLE_DU_RAIL): { rafraichir: () => T[] } {
  return { rafraichir: () => topDuBacklog(lire(), n) };
}
