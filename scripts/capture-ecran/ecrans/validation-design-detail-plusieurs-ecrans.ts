// Le détail en grand d'une carte « Validate its screen » dont le ticket demande plusieurs écrans (ticket 3350) : « Screen 1 of 3 »,
// « Previous screen » et « Next screen » en tête, un seul écran sous le brief, « Validate » et « Send back to the kitchen » au pied.
import type { Ecran } from "./commun.ts";
import { validationDuCorps } from "../../../app/src/vue/validation-design/validation-design-github.ts";
import { CARTE, CORPS, donnees, TEXTE } from "./validation-design-commun.ts";
import { OUVRIR_PARADE } from "./validation-design-commun.ts";

const DEPOT = "chef/parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const rang = (nom: string) =>
  `| ![${nom} — avant](https://github.com/${DEPOT}/blob/${SHA}/docs/captures/58/${nom}-avant.png?raw=true)<br>${nom} — avant | ![${nom} — après](https://github.com/${DEPOT}/blob/${SHA}/docs/captures/58/${nom}-apres.png?raw=true)<br>${nom} — après |`;
const corps = `${CORPS}${rang("journal")}\n${rang("reglages")}\n`;

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (ticket 3350) : le détail en grand d'une carte « Validate its screen » à trois écrans — « Screen 1 of 3 », écran précédent et suivant en tête, un écran à la fois",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE, { cliquer: ".carte-validation .captures-de-validation" }],
  donnees: () => donnees({ ...CARTE, chef: { sorte: "design-validation", texte: TEXTE, design: validationDuCorps(DEPOT, corps) ?? undefined } }),
};
