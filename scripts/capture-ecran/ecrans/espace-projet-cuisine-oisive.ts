// L'espace de « parade » quand sa cuisine est oisive, des cartes sur le rail (#1863) : trois tickets attendent dans TODO,
// aucun cook n'a tourné depuis 42 min, le projet est allumé et rien n'attend un tiers. `facts` porte `cuisineOisive`
// et `status` sa ligne `fault` (runtime/src/cuisine-oisive.ts, #1862) — ce que la box rend, mot pour mot. La tête du
// rail la dit en rouge.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
// Le dernier repère : la fin du dernier cook, à 09:22:00 — 42 min avant la lecture.
const DEPUIS = "2026-10-13T09:22:00.000Z";

const FACTS = {
  ...PARADE.facts,
  compteurs: { rail: 3, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 2 },
  dernierEvenement: { seq: 830, at: DEPUIS, type: "cook.exited", ticket: 9 },
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null, attente: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: ISSUE(22), activite: null, attente: null },
    { ticket: 25, etat: "en attente", titre: "Le menu du soir", url: ISSUE(25), activite: null, attente: null },
  ],
  cooks: [],
  attend: [],
  cuisineOisive: { depuis: DEPUIS, cartes: [21, 22, 25] },
} as Faits;

const STATUS = [
  "fault      IDLE KITCHEN for 42 min — no cook has run, with 3 cards on the rail: #21, #22, #25",
  "project    parade",
  "kitchen    open",
  "",
  "rail       3 queued",
  "  #21  queued  -  since 2 h 05  L'export du journal",
  "  #22  queued  -  since 1 h 10  Un ticket libre",
  "  #25  queued  -  since 48 min  Le menu du soir",
  "",
  "cooks      none running",
  "",
].join("\n");

export const ecran: Ecran = {
  dit: "L'espace de « parade », sa cuisine oisive depuis 42 min avec trois cartes sur le rail (#1863) : la panne en rouge en tête du rail",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
