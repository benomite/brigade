// Les tickets récurrents de « parade » sous Settings (#3231) quand `recurring` n'en rend aucun : la ligne vide.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS, OUVRIR } from "./reglages-du-projet.ts";
import { HAUTEUR } from "./recurrents.ts";
import { HUMAINS } from "./settings-humains.ts";

export const ecran: Ecran = {
  dit: "Les tickets récurrents de « parade » sous Settings, aucun déclaré : « No recurring tickets yet. »",
  largeur: 1440,
  hauteur: HAUTEUR,
  etapes: OUVRIR,
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS, listerLesHumains: HUMAINS, listerLesRecurrents: [] },
    envois: cuisine(RENDUS),
  }),
};
