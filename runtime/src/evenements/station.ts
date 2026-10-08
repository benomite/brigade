// Les faits d'une station : ce qu'elle annonce d'elle-même, ce qui l'empêche de
// servir, et ce qu'elle rapporte de chaque cook.

// Comment un cook a fini, du point de vue de celle qui l'a lancé. `86` : le
// quota est épuisé — un état normal, pas un échec. `disconnected` : la
// connexion Max de la machine a expiré. `refused` : le modèle a refusé de
// répondre (`stop_reason: refusal`) — ni une panne, ni un échec du cook.
export type FinDeCook = "done" | "failed" | "86" | "disconnected" | "refused";

export type FaitStation =
  // Écrit au démarrage, quand l'annonce change : c'est ici que le chef lit ce
  // que la station fournit et combien de cooks elle fait tourner à la fois.
  | { type: "station.announced"; payload: { station: string; engine: string; provides: string[]; maxCooks: number } }
  // Le compte-rendu d'un cook : sa fin, pourquoi, ce qu'il dit avoir fait, et
  // où est son travail. `reconciled` : écrit au démarrage, pour une livraison
  // que la vie précédente du runtime a envoyée en pass sans la raconter.
  | {
      type: "cook.reported";
      payload: { run: string; ending: FinDeCook; reason: string | null; summary: string | null; branch: string; pr: string | null; reconciled?: true };
    }
  // La livraison d'un cook, confrontée à la zone que son ticket portait quand
  // il a été pris. `files` : ce qu'elle écrit hors de cette zone, et les
  // tickets du rail qui possèdent chaque fichier. `cardChanged` : la zone de
  // la fiche a changé pendant la cuisson. Un signal, pas un verdict : la pass
  // juge comme avant. Jamais écrit pour un ticket pris sans zone.
  | { type: "cook.out-of-zone"; payload: { run: string; zone: string[]; files: { path: string; owners: number[] }[]; cardChanged: boolean } }
  // Le quota du compte est épuisé : la station ne prend plus rien avant `until`.
  | { type: "station.86"; payload: { station: string; reason: string; until: string; window: string | null } }
  // La connexion Max a expiré : la station ne prend plus rien avant le
  // « reprendre » du chef. `run` : le cook qui l'a révélé, s'il y en a un.
  | { type: "station.disconnected"; payload: { station: string; reason: string; run: string | null } };
