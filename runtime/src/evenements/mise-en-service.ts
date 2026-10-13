// Les faits de la mise en service demandée au runtime : ce que le chef
// demande, et ce que le runtime en fait. Le geste qui met en service n'est pas
// ici — c'est celui de la box (`deploy/brigade-mise-en-service`), le seul
// process privilégié que le runtime lance jamais.

// Le geste de box, tel que sa règle sudoers le nomme : un chemin entier, rien
// qui se cherche dans un `PATH`.
export const GESTE_DE_BOX = "/usr/local/bin/brigade-mise-en-service";

// Un cook en vol à l'instant où le geste de box part, et ce qu'il avait
// consommé à son dernier relevé — nul : aucun relevé encore.
export type EnVolAuLancement = { run: string; ticket: number | null; tokens: number | null };

// Pourquoi une demande s'éteint sans que le geste de box soit parti. `chef` :
// il y renonce. `current` : au moment de lancer, la comparaison dit la version
// en service à jour — il n'y a plus rien à mettre en service.
export type MotifDAbandon = "chef" | "current";

export type FaitMiseEnService =
  // Le chef demande la mise en service de la version qui attend. `cut` : il a
  // demandé, explicitement, de ne pas attendre le rail calme — sans quoi aucun
  // cook n'est interrompu. Redemandée avec `cut`, une demande qui attendait
  // n'attend plus.
  | { type: "deploy.requested"; payload: { cut: boolean } }
  // La demande s'éteint sans que rien ait été lancé.
  | { type: "deploy.cancelled"; payload: { reason: MotifDAbandon } }
  // Le runtime lance le geste de box : écrit avant que le process existe, une
  // fois par demande. `command` : ce qui est lancé, argument par argument, sans
  // shell. `flying` : les cooks en vol à cet instant — aucun, sauf demande de
  // coupure. `log` : où le geste écrit, relatif au répertoire d'état. `served` :
  // le commit en service à cet instant, d'après la comparaison — c'est à lui
  // que le runtime qui repart se mesure.
  | { type: "deploy.launched"; payload: { command: string[]; flying: EnVolAuLancement[]; log: string; served: string | null } }
  // Le geste de box a rendu la main, et ce runtime est toujours là : rien n'a
  // été redémarré. `tail` : la fin de ce qu'il a écrit. `error` : il n'a pas pu
  // être lancé du tout.
  | { type: "deploy.exited"; payload: { code: number | null; signal: string | null; tail: string; error?: string } }
  // Le geste de box a redémarré le runtime : celui qui l'a lancé n'est plus là
  // pour dire ce qu'il a rendu, c'est celui qui repart qui l'écrit, à son
  // démarrage. `served` : le commit qu'il sert.
  //   `served`   : ce n'est pas celui d'avant — une autre version est en service.
  //   `returned` : c'est celui d'avant — la version n'a pas été mise en service.
  //                `refused` et `reason` : la version que la bascule a refusée
  //                depuis le lancement, et son motif, tels qu'elle les a notés à
  //                côté des versions ; nuls si elle n'a rien noté. `tail` : la
  //                fin de ce que le geste avait écrit quand ce runtime est reparti.
  | { type: "deploy.concluded"; payload: { outcome: "served"; served: string } | { outcome: "returned"; served: string; refused: string | null; reason: string | null; tail: string } };
