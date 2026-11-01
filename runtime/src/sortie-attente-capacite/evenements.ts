// Le fait d'un ticket en WAITING faute de capacité que le chef sort du rail
// pour le confier à un humain (sortie.ts) : aucune station ne fournira ce qui
// lui manque, c'est une tâche — pour le chef, ou pour qui il nomme. Le ticket
// est dans l'enveloppe.
//
// `assignee` : à qui la tâche revient, dans les mots du chef (`chef` sans
// nom). `missing` : les capacités qu'aucune station ne fournit. `title`,
// `context`, `criteria` : la carte du ticket telle que la tâche la reprend — son
// titre, son contexte et ses critères d'acceptation, lus de son issue. Écrit
// de nouveau quand le chef nomme quelqu'un d'autre : le dernier fait.
export type FaitSortieDeCapacite = {
  type: "capability.human-job";
  payload: { assignee: string; missing: string[]; title: string; context: string; criteria: string[] };
};
