// Les commandes de lecture ouvrent le journal en lecture seule : rien n'y crée
// les tables d'un journal écrit par un runtime d'avant une projection, ni ne
// leur donne leur forme du jour. Ce que SQLite répond alors est une erreur de
// schéma, que ce module reconnaît pour que chaque commande la traduise en un
// conseil au lieu d'une trace.
export function journalPasRejoue(erreur: unknown): boolean {
  return erreur instanceof Error && /no such (table|column)/.test(erreur.message);
}
