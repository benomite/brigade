// La page de « parade », confiée à sa box, dont la cuisine ne parvient pas à préparer un worktree (#1119) : la
// raison de l'échec et l'heure du prochain essai, que la box publie (#1118).
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » dont un worktree ne se prépare pas : la raison de l'échec et l'heure du prochain essai (#1119)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, worktree: { ticket: 433, raison: "git fetch : fatal: No space left on device", prochainEssai: "2026-10-13T10:14:00.000Z", acces: null } }),
};
