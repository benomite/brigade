// L'espace de « parade » avec l'équipe de ses agents en tête (ticket 4029) : un badge par agent — supervisor et closer
// d'abord —, chacun avec son état, son dernier geste et sa prochaine passe. Les agents sont ceux de la fixture du test.
import { EQUIPE } from "../../../app/test/autonomie/equipe-fixture.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » : l'équipe de ses agents en tête, un badge par agent",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), lireLesAgents: EQUIPE },
    envois: cuisine(RENDUS),
  }),
};
