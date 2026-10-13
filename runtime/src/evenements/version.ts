// Le fait de la version en attente : ce que le runtime a constaté en comparant
// la version qu'il sert à la branche que le clone de brigade suit, lue sur son
// origine — pas dans le clone, qui n'avance que lorsqu'on le met à jour.

// La cadence à laquelle le runtime compare : une origine se lit sans rien
// coûter à la cuisine, mais pas à chaque tick.
export const CADENCE_DE_COMPARAISON_MS = 10 * 60_000;

// `served` : le commit de la version en service. `branch` : la branche
// comparée, telle que le clone la nomme (`origin/v2`).
export type Comparaison =
  // Le `runtime/src` de la branche est celui qui est servi.
  | { outcome: "current"; served: string; branch: string }
  // La branche porte un `runtime/src` que le projet ne sert pas. `head` : son
  // commit de tête ; `deliveries` : les commits de sa ligne principale — un par
  // livraison mergée — qui changent `runtime/src` et ne sont pas en service ;
  // `since` : l'instant du plus ancien d'entre eux.
  | { outcome: "waiting"; served: string; branch: string; head: string; since: string; deliveries: number }
  // La comparaison n'a pas pu se faire : rien ne dit que la version en service
  // est à jour. `branch` : nulle quand le clone n'a pas dit laquelle il suit.
  | { outcome: "unreadable"; served: string; branch: string | null; reason: string };

export type FaitVersion = {
  // Écrit quand la comparaison change de réponse, pas à chaque comparaison.
  type: "version.compared";
  payload: Comparaison;
};
