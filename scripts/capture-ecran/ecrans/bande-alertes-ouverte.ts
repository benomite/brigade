// La bande d'alertes pleine de « parade » (#907), deux clics plus tard : le « detail » de la connexion
// Max déplié — la ligne de la box, mot pour mot —, et « ask the second… » de la base rouge cliqué — sa
// confirmation, qui dit ce que coûtera le lever.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { PARADE_EN_PANNE } from "./bande-alertes.ts";

export const ecran: Ecran = {
  dit: "La bande d'alertes pleine de « parade », un « detail » déplié et la confirmation d'une demande ouverte",
  largeur: 1440,
  hauteur: 900,
  etapes: [
    { cliquer: '#projets > button[title^="parade — "]' },
    { cliquer: "#alertes > .alerte:nth-child(1) button.detail" },
    { cliquer: '#alertes > .alerte:nth-child(2) button[data-geste="demande"]' },
  ],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: PARADE_EN_PANNE }),
  }),
};
