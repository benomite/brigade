// L'onglet Cooks de « parade », « edit » cliqué sur atelier/claude (#1510, épique #1506) : sous sa ligne, son
// formulaire — son plafond, ses capacités en cases cochées comme elle les déclare, puis ce que les autres stations
// fournissent et ce que ce Mac sait déclarer (le catalogue de « + station », #1307) —,
// avec « Save », « Cancel » et « Remove ».
import type { Ecran } from "./commun.ts";
import { DEFAUTS } from "./ajouter-station.ts";
import { ecran as declarees } from "./cooks-stations-declarees.ts";

export const EDITER = { cliquer: '#cuisson-du-projet li[data-station="atelier/claude"] .fournit-de-station > button.editer' };

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : « edit » cliqué sur atelier/claude — son plafond, ses capacités en cases, « Save », « Cancel » et « Remove »",
  largeur: 1440,
  hauteur: 1400,
  etapes: [...declarees.etapes, EDITER],
  donnees: () => {
    const lues = declarees.donnees();
    return { ...lues, reponses: { ...lues.reponses, defautsDeStation: DEFAUTS } };
  },
};
