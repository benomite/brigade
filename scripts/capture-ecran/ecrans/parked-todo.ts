// Le TODO du chef fait des tickets parked qui l'attendent (#4281) : #16 et #17, pris, parked pour le chef — pour quoi, qui,
// jusqu'à quand, leurs boutons et « park or unpark… ». #22 est parked dans le backlog pour Stripe support : il n'y est pas.
// Rien d'autre n'attend le chef : le TODO a ses deux entrées.
import type { Facts } from "../../../app/src/facts.ts";
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
  attend: [],
} as Facts;

export const donneesDuTodoParked = () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)) },
  // Le bloc `attend` de `status` nommait #12 : il n'attend plus le chef ici.
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: PARADE.status.replace(/^attend .*\n[\s\S]*?^fin attend\n/m, "") } }),
});

export const ecran: Ecran = {
  dit: "Le TODO de « parade » (#4281), deux entrées : #16 et #17 parked pour le chef — pour quoi, qui, jusqu'à quand — et leurs boutons ; #22, parked pour Stripe support, n'y est pas",
  largeur: 1900,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: donneesDuTodoParked,
};
