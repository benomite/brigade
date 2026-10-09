// Les faits du nettoyage : ce que devient le worktree d'un cook une fois son
// ticket servi ou sorti du rail.

// Pourquoi un worktree reste. `pr-open` : le ticket est parti sans être servi,
// et la PR de cette branche est encore ouverte. `unpushed` : il porte un
// travail qui n'est nulle part ailleurs. `failed` : le retrait a échoué.
export type MotifDeGarde = "pr-open" | "unpushed" | "failed";

export type FaitNettoyage =
  // Le worktree et sa branche locale ne sont plus là — retirés, ou constatés
  // absents. `worktree` : son chemin, relatif au répertoire d'état.
  | { type: "worktree.removed"; payload: { worktree: string; branch: string } }
  // Gardé, rien n'y a été touché. Écrit quand le motif change, pas à chaque
  // examen. `detail` : la PR, ce qui reste non poussé, ou ce que git a dit.
  | { type: "worktree.kept"; payload: { worktree: string; branch: string; reason: MotifDeGarde; detail: string } };
