// Le même formulaire d'atelier/claude (#1510), « Remove » cliqué : la confirmation, ce qu'elle retire et son prix en
// une ligne, avant que rien ne parte.
import type { Ecran } from "./commun.ts";
import { ecran as edition } from "./cooks-station-edition.ts";

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : le formulaire d'atelier/claude, « Remove » cliqué — la confirmation et son prix en une ligne",
  largeur: 1440,
  hauteur: 1400,
  etapes: [...edition.etapes, { cliquer: '#cuisson-du-projet li[data-station="atelier/claude"] .edition .retrait > button' }],
  donnees: edition.donnees,
};
