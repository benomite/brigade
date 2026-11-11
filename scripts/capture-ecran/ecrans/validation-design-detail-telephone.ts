// Le détail en grand de la carte « Validate its screen » (ticket 3212) à la largeur d'un téléphone (390 px) : la carte ouverte
// depuis la liste, puis un toucher sur ses captures — le détail en plein écran, l'avant et l'après l'un sous l'autre.
import type { Ecran } from "./commun.ts";
import { donnees } from "./validation-design-commun.ts";

export const ecran: Ecran = {
  dit: "Le téléphone, 390 px de large (ticket 3212) : le détail en grand de la carte « Validate its screen » de #61, en plein écran — avant et après, « Validate », commentaire et « Send back to the kitchen »",
  largeur: 390,
  hauteur: 844,
  etapes: [{ cliquer: ".carte-a-ouvrir" }, { cliquer: ".carte-validation .captures-de-validation" }],
  donnees: () => donnees(),
};
