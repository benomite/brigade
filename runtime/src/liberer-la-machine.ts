// Le ticket dont le travail libère la machine porte `saturation-repair` dès sa création (#4173), quel que
// soit celui qui le dépose — superviseur, manager ou cook : la retenue pour saturation ne bloque jamais sa propre réparation.
// Ce module ne dépend de rien : `github.ts` (la création d'une issue) et `reparation.ts` le partagent.

// Le label du ticket qui répare la saturation de la machine (#4100) : la porte
// de prise le laisse passer quand la machine est à court — sinon la réparation
// attendrait la fin du mal qu'elle répare.
export const LABEL_REPARATION_SATURATION = "saturation-repair";

export type AuteurDeTicket = "supervisor" | "manager" | "cook";

// Ce que dit un ticket dont le travail libère la machine : disque, processus, caches, worktrees.
const LIBERE_LA_MACHINE = /\b(?:reclaim|free(?:s|ing)?\s+(?:up\s+)?(?:the\s+)?(?:disk|memory|space|machine)|disk\s+(?:is\s+)?full|disk\s+space|leftover\s+worktrees?|orphan(?:ed)?\s+(?:node\s+)?process(?:es)?|reap|purge\s+(?:the\s+)?[\w\s,]*caches?|clear(?:ing)?\s+(?:the\s+)?[\w\s,]*caches?|machine\s+saturation|saturat(?:ed|ion))\b/i;

// Les labels d'un ticket dès sa création : ceux qu'on lui donne, plus `saturation-repair` quand son travail libère
// la machine — quel que soit celui qui le dépose (superviseur, manager, cook).
export function etiquettesALaCreation({ titre, corps, labels }: { titre: string; corps: string; labels: readonly string[]; auteur?: AuteurDeTicket }): string[] {
  const libere = LIBERE_LA_MACHINE.test(`${titre}\n${corps}`);
  return libere && !labels.includes(LABEL_REPARATION_SATURATION) ? [...labels, LABEL_REPARATION_SATURATION] : [...labels];
}

