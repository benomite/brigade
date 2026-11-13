// Une attente levée par la cuisine : la marque que le commentaire de la
// station porte sur l'issue du ticket qui attendait, et qui nomme le ticket
// qu'il n'attend plus. Elle vaut pour les trois sources d'une attente (corps,
// fiche, arrêt du cook) sans en réécrire aucune.
export const MARQUE_D_ATTENTE_LEVEE = "<!-- brigade:attente-levee";

// Les tickets dont les commentaires disent l'attente levée.
export function leveesDesCommentaires(corps: readonly string[]): Set<number> {
  const levees = new Set<number>();
  for (const body of corps) {
    if (!body.startsWith(MARQUE_D_ATTENTE_LEVEE)) continue;
    for (const [, n] of (body.split("-->")[0] ?? "").matchAll(/#([1-9]\d*)\b/g)) levees.add(Number(n));
  }
  return levees;
}
