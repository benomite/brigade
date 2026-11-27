// Le moteur qui a cuisiné une livraison (ticket 3747, épique 3518), tel que `facts` le donne : `engine`, et pour
// `claude-api-key` seulement `costUsd`. Ce module ne touche pas `document` ; son affichage est dans affichage.js.

export const ENGINES = ["claude-subscription", "claude-api-key", "codex"] as const;
export type Engine = (typeof ENGINES)[number];
// `costUsd` n'existe que pour `claude-api-key`, et seulement quand la livraison le porte.
export type EngineOfDelivery = { engine: Engine; costUsd?: number };

// Ce que les faits d'une livraison disent de son moteur ; rien d'une livraison d'avant `engine` (la fiche la dit alors sur
// l'abonnement Claude, display.js). Une valeur illisible est refusée par `refuser` : la carte se dit alors illisible.
export function engineRead(engine: unknown, costUsd: unknown, field: string, refuse: (field: string, expected: string) => never): EngineOfDelivery | undefined {
  if (engine === undefined) return undefined;
  if (!ENGINES.includes(engine as Engine)) refuse(`${field}.engine`, `one of ${ENGINES.join(", ")}`);
  const engineName = engine as Engine;
  if (engineName !== "claude-api-key" || costUsd === undefined || costUsd === null) return { engine: engineName };
  if (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd < 0) refuse(`${field}.costUsd`, "a non-negative number");
  return { engine: engineName, costUsd };
}
