// L'espace de « parade », dont chaque ticket du rail porte l'état que GitHub en dit (#2059) : taken (#14), in pass (#12),
// base red (#30, en pass quand la base est rouge) et waiting (#40) — d'après leurs labels, leur PR et la base.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const parade = RENDUS.parade as Rendu & { facts: Faits };
const rail: Faits["rail"] = [
  ...parade.facts.rail.map((carte) => (carte.ticket === 30 ? { ...carte, etat: "base rouge", titre: "La pass, base rouge" } : carte)),
  { ticket: 40, etat: "WAITING", titre: "Le fournisseur de paiement", url: "https://github.com/chef/parade/issues/40", activite: null, attente: null, tiers: { quoi: "an API key", qui: "the payment provider", depuis: "2026-10-12T09:00:00.000Z", relance: null, aLArrivee: "the cook resumes" } },
];

export const ecran: Ecran = {
  dit: "L'espace de « parade », ses tickets dans les états que GitHub en dit : taken, in pass, base red, waiting (#2059)",
  largeur: 2200,
  hauteur: 520,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)) }, envois: cuisine({ ...RENDUS, parade: { ...parade, facts: { ...parade.facts, rail } } }) }),
};
