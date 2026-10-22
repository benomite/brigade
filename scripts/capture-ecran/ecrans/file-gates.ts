// La file de « parade », ses gates hors budget (#1318, épique #1313) : la box donne, dans `coutDesGates`, ce que
// son dernier passage a coûté face à son budget — ici le défaut, que le chef n'a pas posé —, son dépassement, et
// le ticket que la cuisine a ouvert seule pour les y ramener (runtime/src/cout-des-gates.ts, budget-des-gates.ts).
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, demarrage, cuisine, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;

export const COUT_DES_GATES = {
  budget: { durationSeconds: 100, cpuSeconds: 400, parLeChef: { durationSeconds: false, cpuSeconds: false } },
  latest: { project: "parade", ticket: 30, runner: "pass", outcome: "green", durationSeconds: 214.6, cpuSeconds: 990.2, at: "2026-10-13T09:58:40.000Z" },
  overBudget: true,
  lastDay: { runs: 7, durationSeconds: 1402.3, cpuSeconds: 6410.8 },
  lastHour: { runs: 2, durationSeconds: 421.4, cpuSeconds: 1950.6 },
  averages: { lastHour: { durationSeconds: 210.7, cpuSeconds: 975.3 }, lastDay: { durationSeconds: 200.3, cpuSeconds: 915.8 } },
  trend: { durationSeconds: "steady", cpuSeconds: "up" },
  ticket: { number: 31, openedAt: "2026-10-13T09:58:52.000Z", exceeded: ["duration", "cpu"] },
};

export const FACTS = { ...PARADE.facts, coutDesGates: COUT_DES_GATES } as Faits;

export const ecran: Ecran = {
  dit: "La file de « parade », ses gates hors budget : le dernier passage face au budget par défaut, en durée et en processeur, marqué « over budget », et la ligne qui dit que la cuisine a ouvert #31 seule, avec son lien",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
