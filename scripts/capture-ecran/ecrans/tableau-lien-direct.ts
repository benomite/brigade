// Le tableau illisible, « use the direct link » cliqué (#1588) : le rail lu par `ssh` comme avant, une ligne en tête
// pour revenir au tableau.
import { espaceDuTableau, INJOIGNABLE, PRENDRE_LE_LIEN_DIRECT } from "./tableau-commun.ts";

export const ecran = espaceDuTableau("Le tableau de « parade » illisible, « use the direct link » cliqué (#1588) : le rail lu par ssh, une ligne pour revenir au tableau", INJOIGNABLE, { etapes: [PRENDRE_LE_LIEN_DIRECT] });
