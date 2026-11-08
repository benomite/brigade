// Les humains de « parade » sous Settings (#2930), son `projet.json` n'en déclarant aucun : la ligne qui le dit, et
// « add the first human ».
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS } from "./reglages-du-projet.ts";
import { HAUTEUR, OUVRIR_LES_HUMAINS } from "./settings-humains.ts";

export const ecran: Ecran = {
  dit: "Les humains de « parade » sous Settings, aucun déclaré : « No human is declared for this project. » et « add the first human »",
  largeur: 1440,
  hauteur: HAUTEUR,
  etapes: OUVRIR_LES_HUMAINS,
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS, listerLesHumains: [] },
    envois: cuisine(RENDUS),
  }),
};
