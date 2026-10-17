// L'espace de « parade » quand la base est rouge et que le ticket #14 la répare (#928) : la carte du
// projet porte la ligne « nothing cooks: … » de `status`, en tête, mot pour mot — et la bande d'alertes
// la cause. Même cuisine que bande-alertes, avec cette première ligne en plus.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PARADE_EN_PANNE } from "./bande-alertes.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const RIEN_NE_CUIT = "nothing cooks: base red since 1 h 10 ago, repair #14 in progress";
export const PARADE_EN_REPARATION: Rendu = { ...PARADE_EN_PANNE, status: [RIEN_NE_CUIT, PARADE_EN_PANNE.status].join("\n") };

export const ecran: Ecran = {
  dit: "L'espace de « parade », base rouge et réparation #14 en cours : réglages ouverts, la carte du projet porte la ligne « nothing cooks »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#onglets > button[role="tab"]:nth-child(2)' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: PARADE_EN_REPARATION }),
  }),
};
