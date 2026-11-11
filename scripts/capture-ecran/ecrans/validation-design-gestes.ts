// La carte « Validate its screen » de #61 (ticket 3185), un commentaire tapé dans son champ et la page défilée jusqu'à
// lui : « Validate », puis « Send back to the kitchen », allumé dès que le commentaire n'est plus vide.
import type { Ecran } from "./commun.ts";
import { COMMENTAIRE, donnees, OUVRIR_PARADE, TODO } from "./validation-design-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (ticket 3185) : la carte « Validate its screen » de #61, un commentaire tapé — « Validate » et « Send back to the kitchen » allumé",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE, { saisir: `${TODO} textarea`, texte: COMMENTAIRE }, { defiler: `${TODO} textarea` }],
  donnees: () => donnees(),
};
