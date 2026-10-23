// « Tous les projets » sur le téléphone que la station ne connaît plus (#1414) — son jeton révoqué : une phrase le dit,
// avec « pair again », le geste qui le relie de nouveau.
import { type Ecran } from "./commun.ts";
import { HAUTEUR, LARGEUR, lireLaStation, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: () => ({ status: 401, data: { said: "a paired phone's token is required: pair the phone first" } }), connus: PROJETS });
export const ecran: Ecran = {
  dit: "« Tous les projets » sur le téléphone que la station ne connaît plus : une phrase, et « pair again », en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => donnees,
};
