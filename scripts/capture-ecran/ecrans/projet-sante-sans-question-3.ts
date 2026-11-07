// Kitchen > Health, le compteur « Blocked without a question » à 3 (#2557, épique #2553).
import type { ProjetVu } from "../../../app/src/projets/projets.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { KITCHEN } from "./projet-sante.ts";
import { NORMAL } from "./projet-temps-commun.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », Kitchen > Health : le compteur des blocked-on-human sans question, à 3 (#2557)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, KITCHEN],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 }, blockedWithoutQuestion: 3 } as ProjetVu),
};
