// Le moteur qui a cuisiné une livraison (ticket 3747, épique 3518), tel que `facts` le donne : `engine`, et pour
// `claude-api-key` seulement `costUsd`. Ce module ne touche pas `document` ; son affichage est dans affichage.js.

export const MOTEURS = ["claude-subscription", "claude-api-key", "codex"] as const;
export type Moteur = (typeof MOTEURS)[number];
// `costUsd` n'existe que pour `claude-api-key`, et seulement quand la livraison le porte.
export type MoteurDeLivraison = { engine: Moteur; costUsd?: number };

// Ce que les faits d'une livraison disent de son moteur ; rien d'une livraison d'avant `engine` (la fiche la dit alors sur
// l'abonnement Claude, affichage.js). Une valeur illisible est refusée par `refuser` : la carte se dit alors illisible.
export function moteurLu(engine: unknown, costUsd: unknown, champ: string, refuser: (champ: string, attendu: string) => never): MoteurDeLivraison | undefined {
  if (engine === undefined) return undefined;
  if (!MOTEURS.includes(engine as Moteur)) refuser(`${champ}.engine`, `one of ${MOTEURS.join(", ")}`);
  const moteur = engine as Moteur;
  if (moteur !== "claude-api-key" || costUsd === undefined || costUsd === null) return { engine: moteur };
  if (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd < 0) refuser(`${champ}.costUsd`, "a non-negative number");
  return { engine: moteur, costUsd };
}
