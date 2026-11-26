// La fiche de « parade » sous Settings (#4240) : « Served » vidé, puis « Save » — refusé, la ligne nomme l'article, son
// champ est signalé, rien n'est écrit.
import { type Ecran } from "./commun.ts";
import { ecran as remplie } from "./fiche-projet.ts";

export const ecran: Ecran = {
  ...remplie,
  dit: "La fiche de « parade » sous Settings, « Served » vidé puis « Save » : « Served cannot be empty: nothing was saved. » sous le bouton, rien d'écrit",
  etapes: [...remplie.etapes, { saisir: '#fiche-du-projet input[data-item="served"]', texte: "" }, { cliquer: '#fiche-du-projet button[data-geste="enregistrer"]' }],
};
