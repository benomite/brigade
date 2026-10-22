// L'onglet Cooks de « parade » quand ses gates n'ont pas tourné du dernier jour, ni jamais (#1318) : la section
// des 24 h dit 0 passage, 0 s et 0 s — pas un blanc, pas une erreur.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as ACTIVITE } from "./cooks-activite.ts";
import { COUT_DES_GATES } from "./file-gates.ts";

const PARADE = RENDUS.parade as Rendu;
export const FACTS = {
  ...ACTIVITE,
  coutDesGates: { ...COUT_DES_GATES, latest: null, overBudget: false, lastDay: { runs: 0, durationSeconds: 0, cpuSeconds: 0 }, ticket: null },
} as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade », ses gates sans passage du dernier jour : 0 passage, 0 s, 0 s, à côté du budget par défaut",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
