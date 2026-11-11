// La même carte (ticket 3185) sur le téléphone (390 × 844), ouverte depuis la liste, un commentaire tapé et la page
// défilée jusqu'à son champ : « Validate », puis « Send back to the kitchen », allumé.
import type { Ecran } from "./commun.ts";
import { COMMENTAIRE, donnees } from "./validation-design-commun.ts";

export const ecran: Ecran = {
  dit: "Le téléphone, 390 × 844 (ticket 3185) : la carte « Validate its screen » de #61 ouverte, un commentaire tapé — « Validate » et « Send back to the kitchen » allumé",
  largeur: 390,
  hauteur: 844,
  etapes: [{ cliquer: ".carte-a-ouvrir" }, { saisir: "#cartes-du-chef textarea", texte: COMMENTAIRE }, { defiler: "#cartes-du-chef textarea" }],
  donnees: () => donnees(),
};
