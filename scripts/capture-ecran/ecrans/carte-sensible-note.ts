// La même carte « review before merge » (ticket 3224), la note tapée : « Send back » s'allume.
import type { Ecran } from "./commun.ts";
import { donnees, NOTE, OUVRIR_PARADE } from "./carte-sensible-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (ticket 3224) : la carte « review before merge » de #62, la note tapée — « Send back » allumé",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE, { saisir: NOTE, texte: "Keep the audit log when the data is deleted." }],
  donnees,
};
