// Les faits d'une station : ce qu'elle annonce d'elle-même, ce qui l'empêche de
// servir, et ce qu'elle rapporte de chaque cook.

// Comment un cook a fini, du point de vue de celle qui l'a lancé. `86` : le
// quota est épuisé — un état normal, pas un échec. `disconnected` : la
// connexion Max de la machine a expiré. `refused` : le modèle a refusé de
// répondre (`stop_reason: refusal`) — ni une panne, ni un échec du cook.
export type FinDeCook = "done" | "failed" | "86" | "disconnected" | "refused";

// Ce dont la machine peut manquer : du processeur, de la mémoire, du disque.
export type Ressource = "cpu" | "memory" | "disk";

// Ce qui retient une station de prendre un ticket qui pourrait partir : le
// « stop » du chef, le disjoncteur, la connexion, le quota, le plafond de
// cooks, celui des setups, la machine saturée, ou la montée progressive —
// les cooks tout juste partis, comptés d'avance.
export type Retenue = "stopped" | "breaker" | "disconnected" | "quota" | "cap" | "setups" | "machine" | "ramp";

// Un cook est signalé quand cette part du bail de son ticket est passée sans
// progrès : assez tôt pour que le chef le voie avant que le bail ne tombe.
export const PART_SANS_PROGRES = 0.5;

export type FaitStation =
  // Écrit au démarrage, quand l'annonce change : c'est ici que le chef lit ce
  // que la station fournit et combien de cooks elle fait tourner à la fois tant
  // qu'il n'a rien réglé.
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
  // Le chef règle le plafond de cooks simultanés, pendant que la station
  // tourne ou non. `maxCooks: 0` : pas de limite. Il l'emporte sur l'annonce.
  | { type: "station.capped"; payload: { station: string; maxCooks: number } }
  // La machine n'en peut plus : la station ne prend plus de ticket tant que ça
  // dure. `observed`, `limit` : la charge et son plafond (cpu), ou ce qui reste
  // et le minimum exigé, en Mo (memory, disk). Écrit quand la ressource en
  // cause change, pas à chaque regard.
  | { type: "station.saturated"; payload: { station: string; resource: Ressource; observed: number; limit: number } }
  // La machine respire à nouveau : la station reprend.
  | { type: "station.relieved"; payload: { station: string } }
  // Un ticket pourrait partir et la station ne le prend pas : pourquoi. Écrit
  // quand la raison change, pas à chaque regard ; jamais quand aucun ticket
  // n'attend derrière.
  | { type: "station.held"; payload: { station: string; reason: Retenue } }
  // Plus rien ne retient la station, ou plus aucun ticket n'attend.
  | { type: "station.released"; payload: { station: string } }
  // Un cook ne progresse plus : la moitié du bail de son ticket est passée
  // sans que son worktree bouge. Un signal, une fois par épisode — rien n'est
  // arrêté avant l'échéance du bail. `idleMs` : depuis quand ; `leaseMs` : le bail.
  | { type: "cook.stalled"; payload: { run: string; station: string; idleMs: number; leaseMs: number } }
  // Le quota du compte est épuisé : la station ne prend plus rien avant `until`.
  | { type: "station.86"; payload: { station: string; reason: string; until: string; window: string | null } }
  // La connexion Max a expiré : la station ne prend plus rien avant le
  // « reprendre » du chef. `run` : le cook qui l'a révélé, s'il y en a un.
  | { type: "station.disconnected"; payload: { station: string; reason: string; run: string | null } };
