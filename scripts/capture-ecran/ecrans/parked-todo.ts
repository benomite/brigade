// Le TODO du chef fait des tickets parked qui l'attendent (#4281) : #16 et #17, pris, parked pour le chef — qui, pour quoi,
// jusqu'à quand, et « back to the kitchen » sur chacun. #22 est parked dans le backlog pour Stripe support : il n'y est pas.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;
const pourLeChef = (quoi: string, relance: string) => ({ quoi, qui: "the chef", depuis: "2026-10-13T08:00:00.000Z", relance, aLArrivee: "the cook goes on" });

const FACTS = {
  ...PARADE.facts,
  rail: [
    ...PARADE.facts.rail.map((ligne) => (ligne.ticket === 22 ? { ...ligne, tiers: { quoi: "the sandbox keys", qui: "Stripe support", depuis: "2026-10-12T09:00:00.000Z", relance: "2026-10-17T09:00:00.000Z", aLArrivee: "goes back on the rail" } } : ligne)),
    { ticket: 16, etat: "pris", titre: "Le menu du soir", url: issue(16), activite: null, attente: null, tiers: pourLeChef("your call on the menu order", "2026-10-14T08:00:00.000Z") },
    { ticket: 17, etat: "pris", titre: "La carte des vins", url: issue(17), activite: null, attente: null, tiers: pourLeChef("the wine supplier to pick", "2026-10-16T08:00:00.000Z") },
  ],
  attend: [...(PARADE.facts.attend ?? []), { ticket: 16, titre: "Le menu du soir", url: issue(16) }, { ticket: 17, titre: "La carte des vins", url: issue(17) }],
} as Faits;

export const donneesDuTodoParked = () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)) },
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
});

export const ecran: Ecran = {
  dit: "Le TODO de « parade » (#4281) : #16 et #17 parked pour le chef — qui, pour quoi, jusqu'à quand — et leurs boutons ; #22, parked pour Stripe support, n'y est pas",
  largeur: 1900,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: donneesDuTodoParked,
};
