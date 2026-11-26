// La page de « parade », confiée à sa box, qu'aucun ticket n'a encore servi (#1401, épique 1393) : le temps qui
// court depuis l'ajout du projet. Le délai est celui que la box publie dans son suivi (runtime/src/installation/
// delai/), sous `delai` ; l'heure d'ajout est posée par rapport à l'heure figée de la capture (`MAINTENANT`).
import type { Delai } from "../../../app/src/projets/demande.ts";
import { MAINTENANT, type Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

const COURT = (): Delai => ({ ajouteLe: new Date(Date.parse(MAINTENANT) - (2 * 60 + 14) * 60_000 - 30_000).toISOString(), serviLe: null, duree: null });

export const ecran: Ecran = {
  dit: "L'espace de « parade » avant son premier ticket servi : le temps qui court depuis l'ajout du projet (#1401)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, delai: COURT() }),
};
