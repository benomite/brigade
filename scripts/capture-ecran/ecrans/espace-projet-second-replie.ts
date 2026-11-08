// L'espace de « parade », son second replié d'un clic sur le bouton de sa tête (ticket 2923) : le rail prend la place, le
// panneau ne garde qu'une bande étroite et le bouton qui le déplie.
import { ecran as espace } from "./espace-projet.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...espace,
  dit: "L'espace de « parade », son second replié : une bande étroite à droite, et le bouton qui le déplie",
  etapes: [...espace.etapes, { cliquer: "#replier-second" }],
};
