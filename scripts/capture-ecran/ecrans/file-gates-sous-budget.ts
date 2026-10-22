// La file de « parade », ses gates sous le budget que le chef a posé (#1318) : le dernier passage face à lui, en
// durée et en processeur, sans marque ni ticket.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, demarrage, cuisine, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { COUT_DES_GATES } from "./file-gates.ts";

const PARADE = RENDUS.parade as Rendu;

export const FACTS = {
  ...PARADE.facts,
  coutDesGates: {
    ...COUT_DES_GATES,
    budget: { durationSeconds: 240, cpuSeconds: 1200, parLeChef: { durationSeconds: true, cpuSeconds: true } },
    overBudget: false,
    ticket: null,
  },
} as Faits;

export const ecran: Ecran = {
  dit: "La file de « parade », ses gates sous le budget que le chef a posé : le dernier passage face à lui, en durée et en processeur, sans marque ni ticket",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
