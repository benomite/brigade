// « Tous les projets », l'app installée depuis le .dmg (#1011) : la même vue d'ensemble — projets,
// stations —, sans clone de l'app à lire.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { ecran as depuisLeDepot } from "./tous-les-projets.ts";

// Le code de l'app installée : aucun clone à lire.
export const SANS_CLONE = { a: MAINTENANT, clones: [] };

export const ecran: Ecran = {
  ...depuisLeDepot,
  dit: "« Tous les projets », l'app installée depuis le .dmg : les mêmes projets et stations, sans clone de l'app",
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), code: SANS_CLONE } }, envois: cuisine(RENDUS) }),
};
