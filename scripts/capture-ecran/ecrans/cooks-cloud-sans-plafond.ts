// L'onglet Cooks de « parade », « Add a cloud station » cliqué sans aucun plafond (#2232) : rien ne part, et la ligne le
// dit sous le bouton — un plafond d'abord, stations à la fois, heures par jour ou par mois.
import type { Ecran } from "./commun.ts";
import { AJOUTER, cloud, ecran as base, SANS_STATION } from "./cooks-cloud.ts";

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : « Add a cloud station » cliqué sans plafond — la ligne qui dit d'en poser un d'abord",
  largeur: 1440,
  hauteur: 1800,
  etapes: [...base.etapes, AJOUTER],
  donnees: cloud(SANS_STATION),
};
