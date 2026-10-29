// Les réglages de « parade » sur un PC sous Windows (#1154) : le bloc « Ordinary tickets on this PC »,
// sans option ni limite — sa ligne dit pourquoi ce poste ne prend aucun ticket ordinaire.
import { blocDesOrdinaires } from "../../../app/src/ordinaires.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = { ...PROJETS[0]!, ordinaires: true, limiteCooks: 2 };
const STATIONS = [{ station: "pc", distante: false, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: false }];

export const ecran: Ecran = {
  dit: "Les réglages de « parade » sur un PC sous Windows : le bloc « Ordinary tickets on this PC » et pourquoi ce poste n'en prend pas (#1154)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: { ...demarrage(configuration([PARADE, ...PROJETS.slice(1)])), poste: { nom: "this PC", mac: false } },
      espace: [],
      ordinaires: blocDesOrdinaires(PARADE, "win32", STATIONS, true),
    },
    envois: cuisine(RENDUS),
  }),
};
