// L'onglet Cooks de « parade », les rôles de sa cuisine ouverts d'un clic sur leur ligne (#1456) : la ligne repliée
// reste en tête, la liste des rôles se lit dessous.
import { type Ecran } from "./commun.ts";
import { ecran as page } from "./cooks-page.ts";

export const ecran: Ecran = {
  ...page,
  dit: "L'onglet Cooks de « parade » entier, les rôles de sa cuisine ouverts d'un clic sur leur ligne repliée",
  hauteur: 1500,
  etapes: [...page.etapes, { cliquer: "#roles-du-projet summary" }],
};
