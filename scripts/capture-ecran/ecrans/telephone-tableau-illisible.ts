// Le tableau de `parade` illisible sur le téléphone (#1588), en 412 × 915 — GitHub injoignable, et la station hors
// d'atteinte aussi : la phrase, « use the direct link » (le guichet de la station) recommandé, et « read again ».
import { type Ecran } from "./commun.ts";
import { INJOIGNABLE } from "./tableau-commun.ts";
import { HAUTEUR, INJOIGNABLE as STATION_INJOIGNABLE, LARGEUR, lireLaStation, OUVRIR_PARADE, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: () => STATION_INJOIGNABLE, connus: PROJETS });
export const ecran: Ecran = {
  dit: "Le tableau de « parade » illisible sur le téléphone (#1588) : la phrase, « use the direct link » et « read again », en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE],
  donnees: () => ({ ...donnees, reponses: { ...donnees.reponses, tableauDuProjet: INJOIGNABLE } }),
};
