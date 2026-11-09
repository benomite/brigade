// La page de « parade », le bandeau de santé en tête de Stations (#2490, #2921, #3013) : la ligne repliée des plafonds de
// durée que le chef y règle — Rail n'a plus que la bande des chiffres. Le dépôt déclare deux seuils
// (`drift.gatesSeconds` et `drift.tests`) ; les autres n'y sont pas.
import { PLAFONDS, type LectureDesPlafonds } from "../../../app/src/plafonds-duree.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { NORMAL } from "./projet-temps-commun.ts";

// Le bandeau de santé est en tête de Stations (#3013) : le chef y passe d'abord.
export const STATIONS = { cliquer: "#onglets-du-projet button:nth-child(2)" };

const DANS_LE_DEPOT: Record<string, number> = { gatesSeconds: 120, tests: 900 };
export const PLAFONDS_LUS: LectureDesPlafonds = {
  branche: "main",
  plafonds: PLAFONDS.map((plafond) => ({ cle: plafond.cle, nom: plafond.nom, unite: plafond.unite, entier: plafond.entier, duree: plafond.duree, defaut: "defaut" in plafond ? plafond.defaut : null, valeur: DANS_LE_DEPOT[plafond.cle] ?? null })),
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », Stations et la ligne repliée en tête : plafonds de durée (#2490, #3013)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, STATIONS],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS }),
};
