// Les réglages de « parade » (Settings) à la largeur d'un téléphone (#1700) : les trois groupes — le projet, cette
// machine, toi —, chaque réglage avec sa valeur et son contrôle.
import { donnees, LARGEURS, OUVRIR } from "./reglages-commun.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  dit: "Les réglages de « parade » à la largeur d'un téléphone : le projet, cette machine, toi — chaque réglage, sa valeur et son contrôle",
  ...LARGEURS.telephone,
  etapes: OUVRIR,
  donnees: () => donnees("telephone"),
};
