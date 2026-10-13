// Les faits du service : le serveur qu'une station lance depuis le worktree
// d'une livraison qui touche l'interface, et ce qui l'empêche d'en lancer un.

// Pourquoi un serveur ne tourne plus. `exited` : sa commande est sortie d'elle-
// même — un port pris, une commande qui ne sert rien. `retaken` : un cook
// reprend le ticket, dans un worktree neuf. `served`, `left` : le ticket est
// servi, ou a quitté le rail. `shutdown` : le runtime s'en va.
export type FinDeService = "exited" | "retaken" | "served" | "left" | "shutdown";

export type FaitService =
  // Un serveur est lancé : la commande que le projet déclare, depuis le
  // worktree de la livraison, sur le port que son setup lui a attribué.
  // `worktree` : son chemin, relatif au répertoire d'état. Rien ne dit encore
  // que le port répond.
  | { type: "service.started"; payload: { station: string; run: string; worktree: string; branch: string; port: number; pid: number } }
  // Le port du worktree répond : la page peut être ouverte.
  | { type: "service.listening"; payload: { worktree: string; port: number } }
  // Le serveur ne tourne plus. `code`, `signal` : comment sa commande a fini.
  // `tail` : la fin de ce qu'elle a dit, quand elle est sortie d'elle-même.
  | { type: "service.stopped"; payload: { worktree: string; port: number; reason: FinDeService; code: number | null; signal: string | null; tail?: string } }
  // Une livraison n'a pas pu être servie, et ce n'est pas elle : le projet ne
  // déclare pas comment il est servi (`declared: false`), le déclare mal, ou
  // son setup n'attribue pas de port à ce worktree. `why` se dit tel quel au
  // chef ; `delivery` : le ticket de cette livraison. C'est un fait du projet,
  // pas du ticket : il n'entre pas dans son histoire. Écrit quand le motif
  // change, pas à chaque livraison.
  | { type: "service.unavailable"; payload: { station: string; declared: boolean; why: string; delivery: number } }
  // Une livraison a trouvé de quoi être servie : ce qui manquait est là.
  | { type: "service.available"; payload: { station: string } };
