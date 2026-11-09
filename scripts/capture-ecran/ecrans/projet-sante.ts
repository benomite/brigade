// La page de « parade », Settings et sa section « Caps, closer and all projects » (#2490, #2921, #3013, #3014) : les
// plafonds de durée que le chef y règle — Rail n'a plus que la bande des chiffres. Le dépôt déclare deux seuils
// (`drift.gatesSeconds` et `drift.tests`) ; les autres n'y sont pas.
import { PLAFONDS, type LectureDesPlafonds } from "../../../app/src/plafonds-duree.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { NORMAL } from "./projet-temps-commun.ts";

// Le bandeau de santé est une section de Settings (#3014) : le chef l'ouvre, puis la section est amenée à l'écran.
export const SETTINGS = { cliquer: "#onglets-du-projet button:nth-child(3)" };
export const SECTION = { defiler: "#bandeau-sante" };

const DANS_LE_DEPOT: Record<string, number> = { gatesSeconds: 120, tests: 900 };
export const PLAFONDS_LUS: LectureDesPlafonds = {
  branche: "main",
  plafonds: PLAFONDS.map((plafond) => ({ cle: plafond.cle, nom: plafond.nom, unite: plafond.unite, entier: plafond.entier, duree: plafond.duree, defaut: "defaut" in plafond ? plafond.defaut : null, valeur: DANS_LE_DEPOT[plafond.cle] ?? null })),
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », Settings et sa section des plafonds, du closer et de tous les projets : plafonds de durée (#2490, #3014)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, SECTION],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS }),
};
