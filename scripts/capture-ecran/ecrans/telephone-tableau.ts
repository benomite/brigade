// Le Rail de `parade` sur le téléphone appairé (#1588), en 412 × 915 : lu de son tableau sur GitHub — ni guichet ni
// tailnet —, ce qui attend le chef puis l'état de la cuisine, empilés ; la station en lien direct, en second geste.
import { type Ecran } from "./commun.ts";
import { LU } from "./tableau-commun.ts";
import { guichet, HAUTEUR, LARGEUR, lireLaStation, OUVRIR_PARADE, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: guichet(), connus: PROJETS });
export const ecran: Ecran = {
  dit: "Le Rail de « parade » sur le téléphone appairé, lu de son tableau sur GitHub (#1588), en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE],
  donnees: () => ({ ...donnees, reponses: { ...donnees.reponses, tableauDuProjet: LU } }),
};
