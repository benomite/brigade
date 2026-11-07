// La page de « parade », Kitchen > Health (#2490) : le chef a tapé 150 dans la durée des gates et cliqué « save » —
// GitHub a écrit le fichier, la ligne le dit et la valeur est celle du dépôt.
import type { RenduDuPlafond } from "../../../app/src/plafonds-duree.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { KITCHEN, PLAFONDS_LUS } from "./projet-sante.ts";
import { NORMAL } from "./projet-temps-commun.ts";

const ENREGISTRE: RenduDuPlafond = { fait: "saved in the repository — the station applies it at its next fetch", cle: "gatesSeconds", valeur: 150 };
const CHAMP = '[data-bloc="plafonds-duree"] .plafond[data-cle="gatesSeconds"] input';

export const ecran: Ecran = {
  dit: "L'espace de « parade », Kitchen > Health : un plafond de durée enregistré (#2490)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, KITCHEN, { saisir: CHAMP, texte: "150" }, { cliquer: '[data-bloc="plafonds-duree"] .plafond[data-cle="gatesSeconds"] .enregistrer-le-plafond button' }],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS, changerPlafondDuree: ENREGISTRE }),
};
