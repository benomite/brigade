// La file de « parade » avec le triage jour par jour en tête (#1283, épique #1277) : la box donne, dans
// `triage`, ce que le triage a fait chacun des sept derniers jours (runtime/src/carte-todo.ts). Le 11
// n'a aucune issue : sa ligne dit 0 et 0, pas un blanc.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, demarrage, cuisine, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;

export const FACTS = {
  ...PARADE.facts,
  triage: [
    { day: "2026-10-07", decidedAlone: 4, sentToTodo: 1 },
    { day: "2026-10-08", decidedAlone: 0, sentToTodo: 2 },
    { day: "2026-10-09", decidedAlone: 3, sentToTodo: 0 },
    { day: "2026-10-10", decidedAlone: 1, sentToTodo: 1 },
    { day: "2026-10-11", decidedAlone: 0, sentToTodo: 0 },
    { day: "2026-10-12", decidedAlone: 5, sentToTodo: 2 },
    { day: "2026-10-13", decidedAlone: 2, sentToTodo: 1 },
  ],
} as Faits;

export const ecran: Ecran = {
  dit: "La file de « parade », le triage jour par jour en tête : « decided alone » et « sent to TODO » de chacun des sept derniers jours, un jour sans issue à 0 et 0",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
