// L'espace de « parade », son manager éteint par le chef (#906) : `manager` le rend ÉTEINT, et
// c'est la seule chose qui change de la cuisine figée.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ETEINT, PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », son manager éteint : l'interrupteur et la tête du rail",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...(RENDUS.parade as Rendu), manager: MANAGER_ETEINT } }),
  }),
};
