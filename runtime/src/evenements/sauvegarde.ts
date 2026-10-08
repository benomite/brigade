// Le fait que la sauvegarde journalise : elle a réussi. Écrit par la commande
// `sauvegarder`, depuis son propre process, après l'instantané — qui ne le
// contient donc pas.
export type FaitSauvegarde = {
  type: "backup.completed";
  // `name` : le nom de la sauvegarde dans sa destination. `lastSeq`, `events` :
  // jusqu'où va le journal qu'elle porte. `streams` : les flux bruts gardés.
  payload: { name: string; lastSeq: number; events: number; streams: number };
};
