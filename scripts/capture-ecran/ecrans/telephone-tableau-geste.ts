// Le merge de #12 sur le téléphone appairé (#1590), en 412 × 915 : posté sur le tableau par le HTTP natif — ni guichet
// ni tailnet —, la ligne dit « merge the PR: pending ».
import { type Ecran } from "./commun.ts";
import { CONFIRMER, LU, MERGER_LA_PREMIERE, POSTE } from "./tableau-commun.ts";
import { guichet, HAUTEUR, LARGEUR, lireLaStation, OUVRIR_PARADE, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: guichet(), connus: PROJETS });
export const ecran: Ecran = {
  dit: "Le merge de #12 posté du téléphone sur le tableau de « parade » (#1590), en 412 × 915 : la ligne dit « pending »",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE, MERGER_LA_PREMIERE, CONFIRMER],
  donnees: () => ({ ...donnees, reponses: { ...donnees.reponses, tableauDuProjet: LU, gesteAuTableau: POSTE } }),
};
