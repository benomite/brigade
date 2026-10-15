// Les faits du service : le serveur qu'une station lance depuis le worktree
// d'une livraison qui touche l'interface, et ce qui l'empêche d'en lancer un.

// Pourquoi un serveur ne tourne plus. `exited` : sa commande est sortie d'elle-
// même — un port pris, une commande qui ne sert rien. `retaken` : un cook
// reprend le ticket, dans un worktree neuf. `served`, `left` : le ticket est
// servi, ou a quitté le rail. `removed` : son worktree se range par ailleurs.
// `orphaned` : son worktree n'existe plus. `shutdown` : le runtime s'en va.
export type FinDeService = "exited" | "retaken" | "served" | "left" | "removed" | "orphaned" | "shutdown";

export type EcranDuServeur = { name: string; sentence: string | null; source: "declare" | "deduit" };

export type FaitService =
  // Un serveur est lancé : la commande que le projet déclare, depuis le
  // worktree de la livraison, sur le port que son setup lui a attribué.
  // `worktree` : son chemin, relatif au répertoire d'état. Rien ne dit encore
  // que le port répond. `screen` : l'écran à regarder de la livraison
  // (`ecran.ts`) — `name`, l'écran ou la route ; `sentence`, ce qu'il faut y
  // regarder ; `source`, `declare` par le cook ou `deduit` de ses fichiers.
  // Nul : elle n'en a pas, et il n'y a aucune page à ouvrir. Absent d'un fait
  // écrit avant lui.
  | { type: "service.started"; payload: { station: string; run: string; worktree: string; branch: string; port: number; pid: number; screen?: EcranDuServeur | null } }
  // Une livraison d'une app qui ne s'ouvre pas dans un navigateur : rien n'est
  // lancé ni servi, aucune page ne s'ouvre, mais son worktree est tenu pour
  // qu'on y lance l'app. `launch` : ce que le projet déclare pour la lancer
  // (`service.ts`) ; `how` : comment voir l'écran (`ecran.ts`), la commande
  // sur le worktree comprise — nul, la livraison n'a pas d'écran. `screen` :
  // comme pour `service.started`.
  | { type: "service.held"; payload: { station: string; run: string; worktree: string; branch: string; launch: string; how: string | null; screen: EcranDuServeur | null } }
  // Le worktree tenu n'a plus à l'être : il part, sauf quand le runtime s'en va.
  | { type: "service.released"; payload: { worktree: string; reason: Exclude<FinDeService, "exited"> } }
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
