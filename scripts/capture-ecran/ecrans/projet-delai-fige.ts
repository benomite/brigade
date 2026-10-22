// La page de « parade », confiée à sa box, dont le premier ticket est servi (#1401, épique 1393) : la durée de
// l'ajout du projet à ce ticket, figée — un second ticket servi ne la change pas. Le délai est celui que la box
// publie dans son suivi (runtime/src/installation/delai/), sous `delai`.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » après son premier ticket servi : la durée de l'ajout à ce ticket, figée (#1401)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, delai: { ajouteLe: "2026-10-20T09:00:00.000Z", serviLe: "2026-10-20T11:34:56.000Z", duree: 9_296_000 } }),
};
