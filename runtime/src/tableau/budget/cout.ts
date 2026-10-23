// Ce que le rafraîchissement du tableau de la cuisine coûte à GitHub : les appels
// que son client émet (lectures et écritures, tous les projets), comptés par le
// compteur du budget (limite-github.ts) sous la lecture « board », dans la même
// unité que lui — des appels sur l'heure glissante.
import type { Lecture, Repartition } from "../../limite-github.ts";

export const LECTURE_DU_TABLEAU: Lecture = "board";

// Les appels du tableau sur l'heure écoulée ; zéro sans activité (ou sans compteur).
export function coutDuTableau(r: Repartition | null): number {
  return r?.parLecture.find(({ nom }) => nom === LECTURE_DU_TABLEAU)?.appels ?? 0;
}

// La ligne de `status` : toujours présente, à zéro quand le tableau n'a rien appelé.
export function direLeCoutDuTableau(r: Repartition | null): string {
  const n = coutDuTableau(r);
  return `${n} ${n === 1 ? "call" : "calls"} per hour, all projects`;
}
