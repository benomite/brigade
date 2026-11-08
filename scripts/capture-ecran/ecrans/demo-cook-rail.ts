// Scène 4 de la démo (ticket 2875) : #21 pris par le cook de la box, qui écrit `app/src/export.ts`.
import type { Ecran } from "./commun.ts";
import { donneesDe, OUVRIR_PARADE, PRIS } from "./demo-commun.ts";

export const ecran: Ecran = {
  dit: "La démo, scène 4 : la colonne Taken de « parade », #21 pris par le cook de la box qui écrit un fichier",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: () => donneesDe(PRIS),
};
