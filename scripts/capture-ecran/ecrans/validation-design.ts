// La carte « Validate its screen » de #61 dans TODO (ticket 3185) : la question, les captures avant et après lues sans un
// clic, le lien de la PR, « Validate » et « Send back to the kitchen » sous le champ du commentaire.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./validation-design-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (ticket 3185) : la carte « Validate its screen » de #61 dans TODO — question, captures avant/après, lien de la PR, « Validate », commentaire et « Send back to the kitchen »",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: () => donnees(),
};
