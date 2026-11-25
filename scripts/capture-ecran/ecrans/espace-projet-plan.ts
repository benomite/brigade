// L'espace de « parade » tel que la vue dessine le plan de la cuisine (#4238) : backlog — le rail en tête —, manager, cooks,
// pass, served. #22 est parked dans le backlog, il attend Stripe support ; #16, pris, est parked dans Cooks et attend le chef :
// il est aussi dans son TODO, avec #12. En haut, la ligne du supervisor et celle du closer, d'après l'équipe de la fixture.
import type { Faits } from "../../../app/src/faits.ts";
import { EQUIPE } from "../../../app/test/autonomie/equipe-fixture.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;

const FACTS = {
  ...PARADE.facts,
  rail: [
    ...PARADE.facts.rail.map((ligne) =>
      ligne.ticket === 22 ? { ...ligne, tiers: { quoi: "the sandbox keys", qui: "Stripe support", depuis: "2026-10-12T09:00:00.000Z", relance: "2026-10-17T09:00:00.000Z", aLArrivee: "goes back on the rail" } } : ligne,
    ),
    { ticket: 16, etat: "pris", titre: "Le menu du soir", url: issue(16), activite: null, attente: null, tiers: { quoi: "your call on the menu order", qui: "the chef", depuis: "2026-10-13T08:00:00.000Z", relance: "2026-10-14T08:00:00.000Z", aLArrivee: "the cook goes on" } },
  ],
  attend: [...(PARADE.facts.attend ?? []), { ticket: 16, titre: "Le menu du soir", url: issue(16) }],
  rolesCuisine: [
    { role: "supervisor", does: "watches the whole kitchen", latest: { what: "parked #16 for the chef", ticket: 16, at: "2026-10-13T09:40:00.000Z" } },
    { role: "closer", does: "tidies what is served", latest: { what: "removed 412 dead lines", ticket: null, at: "2026-10-13T03:12:00.000Z" } },
  ],
} as Faits;

export const ecran: Ecran = {
  dit: "L'espace de « parade » : le plan de la cuisine — backlog (le rail en tête), manager, cooks, pass, served —, #22 parked dans le backlog, #16 parked pour le chef dans Cooks et dans son TODO, la bande du supervisor et du closer (#4238)",
  largeur: 1900,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), lireLesAgents: EQUIPE },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
