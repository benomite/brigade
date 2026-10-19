// Les mêmes réglages, l'app installée depuis le .dmg (#1011) : elle n'a pas de clone, rien ne se dit
// de son code — la lecture des clones ne rend aucune ligne (retard.ts, `tenirRetards` sans `app`).
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { ecran as depuisLeDepot } from "./reglages-code.ts";

export const SANS_CLONE = { a: MAINTENANT, clones: [] };

export const ecran: Ecran = {
  ...depuisLeDepot,
  dit: "Les mêmes réglages, l'app installée depuis le .dmg : sans clone, aucune ligne sur son code",
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), code: SANS_CLONE }, espace: [] }, envois: cuisine(RENDUS) }),
};
