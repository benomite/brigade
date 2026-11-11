// Le détail en grand de la carte « Validate its screen » de #61 (ticket 3212) : un clic sur ses captures, dans TODO, l'ouvre
// par-dessus l'app — la question, l'avant et l'après côte à côte à la taille de la fenêtre, le lien de la PR, « Validate »,
// le commentaire et « Send back to the kitchen ».
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./validation-design-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (ticket 3212) : le détail en grand de la carte « Validate its screen » de #61, ouvert d'un clic sur ses captures — avant et après côte à côte, zoom, « Validate » et « Send back to the kitchen »",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE, { cliquer: ".carte-validation .captures-de-validation" }],
  donnees: () => donnees(),
};
