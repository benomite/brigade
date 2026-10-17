// L'espace de « parade », son manager allumé (#906) : `manager` le rend ALLUMÉ.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », son manager allumé : l'interrupteur, et le rail qui avance",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...(RENDUS.parade as Rendu), manager: MANAGER_ALLUME } }),
  }),
};
