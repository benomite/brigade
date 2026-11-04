// L'onglet Cooks de « parade », 4 h par jour tapées puis « Add a cloud station » cliqué, avant sa première station
// cloud (#2232) : la liste de ce qu'une station reçoit, et de ce qu'elle ne reçoit jamais, à approuver une fois —
// « Approve and add », recommandé, et « Cancel ».
import type { Ecran } from "./commun.ts";
import { AJOUTER, CHAMP, cloud, ecran as base, SANS_STATION } from "./cooks-cloud.ts";

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : un plafond tapé, « Add a cloud station » cliqué — ce qu'une station reçoit, à approuver une fois",
  largeur: 1440,
  hauteur: 1800,
  etapes: [...base.etapes, { saisir: CHAMP("heuresParJour"), texte: "4" }, AJOUTER],
  donnees: cloud(SANS_STATION),
};
