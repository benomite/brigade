// Les faits que le runtime journalise sur sa propre vie.
export type FaitRuntime =
  | { type: "runtime.started"; payload: { pid: number; host: string; node: string } }
  // Arrêt demandé : le process a reçu le signal et a fermé proprement.
  | { type: "runtime.stopped"; payload: { signal: string } }
  // Écrit au démarrage suivant, quand la vie précédente s'est terminée sans
  // `runtime.stopped` : crash, `kill -9`, coupure de courant.
  | { type: "runtime.interrupted"; payload: { startedSeq: number } }
  // Le battement : écrit à chaque tick, avec la cadence attendue. C'est son âge
  // qui révèle un runtime figé.
  | { type: "runtime.ticked"; payload: { intervalMs: number } };

export const BATTEMENT = "runtime.ticked";
