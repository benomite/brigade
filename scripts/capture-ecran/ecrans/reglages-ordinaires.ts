// Les réglages de « parade » : l'onglet Settings, avec le bloc « Ordinary tickets on this Mac »null.
import { blocDesOrdinaires } from "../../../app/src/ordinaires.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = { ...PROJETS[0]!, ordinaires: true, limiteCooks: 2 };
const STATIONS = [
  { station: "mac", distante: false, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: false },
];

export const ecran: Ecran = {
  dit: "Les réglages de « parade » : le bloc « Ordinary tickets on this Mac », l'option posée et la limite de cooks",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#onglets > button[role="tab"]:nth-child(2)' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration([PARADE, ...PROJETS.slice(1)])),
      espace: [],
      ordinaires: blocDesOrdinaires(PARADE, "darwin", STATIONS, true),
    },
    envois: cuisine(RENDUS),
  }),
};
