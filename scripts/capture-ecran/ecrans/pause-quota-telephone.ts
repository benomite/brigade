// Le rail de « parade » sur le téléphone pendant une pause de quota GitHub du compte (#3482, pause-quota-commun.ts) : la
// même pause, dite des mêmes mots qu'au bureau, en largeur de téléphone.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_EN_PAUSE } from "./pause-quota-commun.ts";
import { HAUTEUR, LARGEUR } from "./telephone-commun.ts";
import { OUVRIR_PARADE } from "./telephone-file-commun.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade » sur le téléphone pendant une pause de quota GitHub du compte, en 412 × 915 (#3482)",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE],
  donnees: () => {
    const tout = demarrage(configuration(PROJETS));
    return {
      maintenant: MAINTENANT,
      reponses: {
        demarrage: { ...tout, configuration: { ...tout.configuration, chemin: "no projects file on this phone" }, code: undefined, stations: undefined, projetsDesStations: undefined, telephone: { github: { compte: "chef" } } },
        espace: [],
      },
      envois: cuisine({ ...RENDUS, parade: RENDU_EN_PAUSE }),
    };
  },
};
