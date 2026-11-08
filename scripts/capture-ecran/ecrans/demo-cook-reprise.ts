// Scène 7 de la démo (ticket 2875), côté poste : la réponse du chef jouée, #21 repris par le cook, qui lance les tests.
import type { Ecran } from "./commun.ts";
import { donneesDe, OUVRIR_PARADE, REPRIS } from "./demo-commun.ts";

export const ecran: Ecran = {
  dit: "La démo, scène 7 : le rail de « parade » une fois la réponse jouée, #21 repris par un cook",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: () => donneesDe(REPRIS),
};
