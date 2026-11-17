// Le rail de « parade » sur GitHub seul, #22 à l'étape `tests written` (ticket 3725) : ses tests d'acceptation sont écrits
// et gelés en premier commit de sa branche (label `tests-written`) — il reste dans On the rail, dit « tests written » et
// non plus « queued », jusqu'à ce qu'un cook le prenne. Le reste est le rail de rail-github-seul.ts.
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, SIGNES, SUR_GITHUB, TABLEAU_FIGE, ticket } from "./github-seul-commun.ts";

const TESTS_ECRITS = { ...SUR_GITHUB, tickets: SUR_GITHUB.tickets.map((un) => (un.ticket === 22 ? ticket(22, "tests écrits", { creeLe: "2026-10-13T09:01:00.000Z" }) : un)) };

export const ecran: Ecran = {
  dit: "Le rail de « parade » sur GitHub seul : #22, ses tests d'acceptation écrits et gelés, dit « tests written » dans On the rail, entre « queued » et « taken » (#3725)",
  largeur: 2200,
  hauteur: 560,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine({ ...RENDUS, parade: renduDeParade(avecLeRail(TABLEAU_FIGE, TESTS_ECRITS, SIGNES)) }) }),
};
