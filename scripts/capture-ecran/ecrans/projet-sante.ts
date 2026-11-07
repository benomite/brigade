// La page de « parade », Kitchen > Health (#2490, épique #2484) : le temps des tickets — en général et celui de la
// pass, par ticket et dans le temps — et les plafonds de durée que le chef y règle. Le dépôt déclare deux seuils
// (`drift.gatesSeconds` et `drift.tests`) ; les autres n'y sont pas.
import { PLAFONDS, type LectureDesPlafonds } from "../../../app/src/plafonds-duree.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { NORMAL } from "./projet-temps-commun.ts";

export const KITCHEN = { cliquer: "#onglets-du-projet button:nth-child(3)" };

const DANS_LE_DEPOT: Record<string, number> = { gatesSeconds: 120, tests: 900 };
export const PLAFONDS_LUS: LectureDesPlafonds = {
  branche: "main",
  plafonds: PLAFONDS.map((plafond) => ({ cle: plafond.cle, nom: plafond.nom, unite: plafond.unite, entier: plafond.entier, duree: plafond.duree, defaut: "defaut" in plafond ? plafond.defaut : null, valeur: DANS_LE_DEPOT[plafond.cle] ?? null })),
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », Kitchen > Health : temps des tickets et plafonds de durée (#2490)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, KITCHEN],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS }),
};
