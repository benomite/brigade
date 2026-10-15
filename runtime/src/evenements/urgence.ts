// Les faits de l'alerte d'urgence : ce que le runtime a annoncé au chef quand
// toute la cuisine l'attend. L'urgence elle-même ne s'écrit pas (elle se relit
// du rail) ; ces faits ne gardent que ce qui a été dit, et quand.

export type FaitUrgence =
  // Écrit à l'apparition de l'urgence, ou quand sa cause change (`reminder`
  // faux), puis une fois par espacement tant qu'elle ne bouge pas (`reminder`
  // vrai). `key` : ce qui fait la même urgence — son début et ses décisions en
  // cause. `label` : la ligne d'alerte. `decision`, `ticket`, `cause`, `geste` :
  // la décision qui retient le plus de tickets, comme l'état la expose.
  // `since` : le début de l'arrêt total.
  | {
      type: "urgence.alerted";
      payload: { key: string; label: string; decision: string; ticket: number | null; cause: string; geste: string; since: string; retenus: number[]; reminder: boolean };
    }
  // Écrit quand l'urgence annoncée est levée : le compteur repart de zéro.
  | { type: "urgence.lifted"; payload: { key: string } };
