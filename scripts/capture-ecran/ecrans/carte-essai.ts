// Les cartes en pass et servies de « parade » avec « try it » (#3215) : aucun essai en cours.
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

export const ecran: Ecran = {
  dit: "Les cartes de « parade » qui déclarent comment les essayer : « try it » sur chacune",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      espace: [SECOND],
      essais: { declaration: { declaration: { command: "npm run dev" } }, essais: {} },
    },
    envois: cuisine(RENDUS),
  }),
};
