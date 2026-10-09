// Les faits du nettoyage : ce que devient le worktree d'un cook une fois ce
// cook fini, et sa branche locale une fois son ticket servi ou sorti du rail.

// Pourquoi un worktree reste. `failed` : ce qui y traîne n'a pas pu être
// commité, ou il n'a pas pu être retiré. `pr-open` et `unpushed` ne s'écrivent
// plus : ce sont les motifs d'avant #164, quand un worktree attendait son
// ticket — un journal de ce temps-là les porte encore.
export type MotifDeGarde = "pr-open" | "unpushed" | "failed";

export type FaitNettoyage =
  // Le worktree n'est plus là — rangé, ou constaté absent ; sa branche reste.
  // `worktree` : son chemin, relatif au répertoire d'état. `harvest` : le
  // commit de ce qui y traînait, posé sur la branche, ou null. Sans `harvest`,
  // le fait est d'avant #164 : la branche locale est partie avec le worktree.
  | { type: "worktree.removed"; payload: { worktree: string; branch: string; harvest?: string | null } }
  // Gardé, rien n'y a été touché. Écrit une fois, pas à chaque essai.
  // `detail` : ce que git a dit.
  | { type: "worktree.kept"; payload: { worktree: string; branch: string; reason: MotifDeGarde; detail: string } }
  // La branche locale d'un cook n'est plus là : son ticket est servi ou sorti
  // du rail, et tous ses commits sont sur l'origine.
  | { type: "branch.removed"; payload: { branch: string } };
