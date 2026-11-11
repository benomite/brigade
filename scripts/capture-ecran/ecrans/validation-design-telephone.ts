// La même carte « Validate its screen » (ticket 3185) à la largeur d'un téléphone (390 × 844) : l'app s'ouvre sur les
// cartes qui attendent le chef, et un toucher ouvre celle de #61.
import type { Ecran } from "./commun.ts";
import { donnees } from "./validation-design-commun.ts";

export const ecran: Ecran = {
  dit: "Le téléphone, 390 × 844 (ticket 3185) : la carte « Validate its screen » de #61 ouverte depuis la liste — question, captures, lien de la PR, « Validate », commentaire et « Send back to the kitchen »",
  largeur: 390,
  hauteur: 844,
  etapes: [{ cliquer: ".carte-a-ouvrir" }],
  donnees: () => donnees(),
};
