// Les faits de la dérive : les seuils que le chef déclare sur les mesures du
// projet, et ce que le runtime dit quand l'une d'elles en franchit un.

// Un seuil vaut null tant que le chef ne l'a pas déclaré : rien n'est alors
// signalé à ce titre. `growthPercent` porte sur la pente — la croissance d'une
// mesure d'état sur les dix derniers merges —, les autres sur sa valeur.
export type Seuils = {
  tests: number | null;
  testsSeconds: number | null;
  gatesSeconds: number | null;
  contextKb: number | null;
  repoMb: number | null;
  merges: number | null;
  growthPercent: number | null;
};

export type FaitDerive =
  // Les seuils en vigueur, écrits quand ils changent : c'est ici que `status`
  // et `mesures` les lisent.
  | { type: "drift.configured"; payload: { limits: Seuils } }
  // Une mesure vient de franchir son seuil. Écrit une fois : rien ne le répète
  // tant qu'elle reste au-delà. `measure` : la mesure, ou `growth:<mesure>`
  // pour sa pente ; `observed`, `limit` : dans l'unité du seuil.
  | { type: "drift.crossed"; payload: { measure: string; observed: number; limit: number } }
  // Elle est repassée sous son seuil, ou le seuil n'est plus déclaré : un
  // nouveau franchissement sera signalé.
  | { type: "drift.cleared"; payload: { measure: string } };
