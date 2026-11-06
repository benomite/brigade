// « Tous les projets » sur le téléphone que la station ne connaît plus (#1414) — son jeton révoqué : une phrase le dit,
// avec « forget the station », le geste qui l'oublie (#2500 : aucun appairage neuf ne se tire plus).
import { type Ecran } from "./commun.ts";
import { HAUTEUR, LARGEUR, lireLaStation, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: () => ({ status: 401, data: { said: "a paired phone's token is required: pair the phone first" } }), connus: PROJETS });
export const ecran: Ecran = {
  dit: "« Tous les projets » sur le téléphone que la station ne connaît plus : une phrase, et « forget the station », en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => donnees,
};
