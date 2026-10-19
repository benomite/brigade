// Les faits de la mise à jour de la station : ce qu'elle a donné, relayé au
// journal de chaque projet que la station sert. La mise à jour elle-même ne
// touche à aucun journal — elle tourne sous root, hors de la station — : elle
// note ce qu'elle a fait dans son répertoire (`update/state.ts`), et la
// station le recopie ici, une fois par issue.
//
// `at` : l'instant où cela s'est su sur la machine — pour un passage, celui où
// la station a démarré sur la nouvelle version.
export type FaitMiseAJour =
  // La station est passée de `previous` à `version`.
  | { type: "update.installed"; payload: { version: string; previous: string | null; at: string } }
  // `target` n'a pas démarré (`reason`) : la station est revenue à `restored`.
  // `restoreFailed` : nul si la version d'avant tourne de nouveau ; sinon,
  // pourquoi le retour a échoué lui aussi.
  | { type: "update.reverted"; payload: { target: string; restored: string; reason: string; at: string; restoreFailed: string | null } };
