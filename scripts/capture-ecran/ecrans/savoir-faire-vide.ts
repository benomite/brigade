// La page de « parade », Settings : le savoir-faire d'un projet sans `.brigade/know-how.md`, ou sans entrée (#4239) — une
// ligne vide, pas une erreur.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PLAFONDS_LUS, SETTINGS } from "./projet-sante.ts";
import { NORMAL } from "./projet-temps-commun.ts";
import { SAVOIR } from "./savoir-faire.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », Settings : le savoir-faire d'un projet sans fichier ni entrée, son état vide (#4239)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, SAVOIR],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS, savoirDuProjet: { depot: "chef/parade", branche: "main", vide: true, entries: [] } }),
};
