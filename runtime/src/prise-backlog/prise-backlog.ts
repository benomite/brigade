// La prise du backlog par le manager (#4221, épique #4131 ; règles 2 et 3 du
// processus simplifié, docs/superpowers/specs/2026-11-24-simplified-process.md) :
// quand la cuisine a de la place, le manager choisit lui-même la prochaine
// issue ouverte du backlog, la calibre juste avant qu'un cook la prenne, et y
// pose `fire` — ni le chef ni le second n'ont de geste à faire.
//
//   choisirSuivante   la prochaine issue : la meilleure priorité, puis la plus
//                     ancienne ; jamais une `idea`, jamais une issue parked, et
//                     rien sans place dans la cuisine. Sans E/S.
//   prendreSuivante   le choix, puis le calibrage (le modèle et l'effort) posé
//                     sur l'issue, puis `fire`, puis le cook.
//   placeLibre        la place de la cuisine : ses places, moins ses cooks en
//                     cuisine et les tickets lancés qui attendent le leur.
import { priorite } from "../alimenter.ts";
import { LABEL_WAITING } from "../attente.ts";
import { calibrage as calibragePose, complet, EFFORTS, MODELES, type Calibrage, type CalibragePose } from "../calibrage.ts";
import { LABEL, MIS_DE_COTE } from "../github.ts";

// Une issue ouverte du backlog, telle que GitHub la rend.
export type IssueDuBacklog = { number: number; labels: string[]; createdAt: string };

// Le label d'une issue parked (règle 13), et ceux qu'il remplace : elle attend
// quelqu'un — le chef, un tiers, un autre ticket — ou elle est mise de côté.
const PARKED = ["parked", LABEL_WAITING, "blocked-on-human", "decision", "question", "product-question", "chef-todo", ...MIS_DE_COTE];
// Ce qui n'est pas un ticket à prendre : une idée en réserve, une épique (elle
// se découpe), l'ancienne issue du tableau de la cuisine.
const PAS_UN_TICKET = ["idea", "epic", "kitchen-board"];
// Ce qui est déjà sur le rail : lancé, tenu par un cook, ou en pass.
const DEJA_PRIS = [LABEL, "taken", "in-pass"];
const HORS_DU_CHOIX = [...PARKED, ...PAS_UN_TICKET, ...DEJA_PRIS];

const prenable = (issue: IssueDuBacklog) => !issue.labels.some((label) => HORS_DU_CHOIX.includes(label));
// Sans label de priorité, une issue passe après les autres ; sans date lisible, après celles de sa priorité.
const rang = (issue: IssueDuBacklog) => priorite(issue.labels) ?? Infinity;
const age = (issue: IssueDuBacklog) => {
  const date = Date.parse(issue.createdAt);
  return Number.isNaN(date) ? Infinity : date;
};
const avant = (a: IssueDuBacklog, b: IssueDuBacklog) => rang(a) - rang(b) || age(a) - age(b) || a.number - b.number;

// Les places de la station — un nombre, ou ce qui les relit à chaque tour —, moins ses cooks en cuisine, moins les issues ouvertes où `fire` est posé et qu'aucun cook
// ne tient encore : chacune prendra une place au tour suivant de la station. Une issue lancée mais parked, ou mise de
// côté, n'en prendra pas.
export function placeLibre({ places, enCuisine, ouvertes }: { places: number | (() => number); enCuisine: number; ouvertes: readonly IssueDuBacklog[] }): number {
  const enFile = ouvertes.filter((issue) => issue.labels.includes(LABEL) && !issue.labels.some((label) => [...PARKED, "taken", "in-pass"].includes(label))).length;
  return (typeof places === "number" ? places : places()) - enCuisine - enFile;
}

// `freeRoom` : les places libres de la cuisine.
export function choisirSuivante<I extends IssueDuBacklog>({ backlog, freeRoom }: { backlog: readonly I[]; freeRoom: number }): I | null {
  if (freeRoom < 1) return null;
  return backlog.filter(prenable).sort(avant)[0] ?? null;
}

export type PriseDuBacklog<I extends IssueDuBacklog> = {
  backlog: readonly I[];
  freeRoom: number;
  // Le calibrage du manager pour l'issue choisie ; une dimension à null, ou une réponse à null : il n'en a pas.
  calibrate: (issue: I) => Promise<CalibragePose | null>;
  // Pose un label sur l'issue.
  addLabel: (number: number, label: string) => Promise<void>;
  // Pose le calibrage sur l'issue (`model:` et `effort:`).
  storeCalibration: (number: number, calibrage: Calibrage) => Promise<void>;
  // Un cook prend l'issue.
  startCook: (issue: I) => Promise<void>;
  // Où va ce qui échoue (journald).
  avertir?: (message: string) => void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Rend l'issue prise, ou null : rien à prendre, ou une étape qui a échoué —
// dite, et rien de ce qui la suit n'est fait ; le tour suivant la reprend.
// Le calibrage que le chef a posé sur une dimension l'emporte : le manager ne
// calibre que ce qui manque.
export async function prendreSuivante<I extends IssueDuBacklog>(prise: PriseDuBacklog<I>): Promise<I | null> {
  const issue = choisirSuivante(prise);
  if (issue === null) return null;
  const avertir = prise.avertir ?? ((texte: string) => console.error(texte));
  try {
    const pose = calibragePose(issue.labels);
    if (!complet(pose)) {
      const lu = await prise.calibrate(issue);
      const calibre = { model: pose.model ?? lu?.model, effort: pose.effort ?? lu?.effort };
      if (!MODELES.some((m) => m === calibre.model) || !EFFORTS.some((e) => e === calibre.effort)) {
        avertir(`brigade : #${issue.number} not taken from the backlog — the manager's calibration is not readable: ${JSON.stringify(lu)}`);
        return null;
      }
      await prise.storeCalibration(issue.number, calibre as Calibrage);
    }
    await prise.addLabel(issue.number, LABEL);
  } catch (erreur) {
    avertir(`brigade : #${issue.number} not taken from the backlog — ${message(erreur)}`);
    return null;
  }
  try {
    await prise.startCook(issue);
  } catch (erreur) {
    // `fire` et le calibrage sont posés : la station la prend à son tour suivant.
    avertir(`brigade : #${issue.number} taken from the backlog, its cook did not start — ${message(erreur)}`);
  }
  return issue;
}
