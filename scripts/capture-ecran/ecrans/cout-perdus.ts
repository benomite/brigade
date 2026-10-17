// L'onglet Cost de « parade », la liste des tokens perdus déployée (#911) : un clic sur le chiffre
// sous les trois de tête. Mêmes données que l'onglet replié (cout.ts).
import { ecran as cout } from "./cout.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...cout,
  dit: "L'onglet Cost de « parade », la liste des tokens perdus (essais rouges et cooks interrompus) déployée",
  etapes: [...(cout.etapes ?? []), { cliquer: ".perdus-total" }],
};
