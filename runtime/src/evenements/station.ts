// Les faits d'une station : ce qu'elle annonce d'elle-même, ce qui l'empêche de
// servir, et ce qu'elle rapporte de chaque cook.

// Comment un cook a fini, du point de vue de celle qui l'a lancé. `86` : le
// quota est épuisé — un état normal, pas un échec. `disconnected` : la
// connexion Max de la machine a expiré.
export type FinDeCook = "done" | "failed" | "86" | "disconnected";

export type FaitStation =
  // Écrit au démarrage, quand l'annonce change : c'est ici que le chef lit ce
  // que la station fournit et combien de cooks elle fait tourner à la fois.
  | { type: "station.announced"; payload: { station: string; engine: string; provides: string[]; maxCooks: number } }
  // Le compte-rendu d'un cook : sa fin, pourquoi, ce qu'il dit avoir fait, et
  // où est son travail.
  | {
      type: "cook.reported";
      payload: { run: string; ending: FinDeCook; reason: string | null; summary: string | null; branch: string; pr: string | null };
    }
  // Le quota du compte est épuisé : la station ne prend plus rien avant `until`.
  | { type: "station.86"; payload: { station: string; reason: string; until: string; window: string | null } }
  // La connexion Max a expiré : la station ne prend plus rien avant le
  // « reprendre » du chef. `run` : le cook qui l'a révélé, s'il y en a un.
  | { type: "station.disconnected"; payload: { station: string; reason: string; run: string | null } };
