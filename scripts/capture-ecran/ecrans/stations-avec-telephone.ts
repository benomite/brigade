// « Tous les projets » avec un téléphone appairé dans les stations (#1162) : sa ligne dit qu'il ne cuisine pas.
import type { Ecran } from "./commun.ts";
import { accueil } from "./telephone-station.ts";

export const ecran: Ecran = {
  dit: "« Tous les projets » : la box, ce Mac et un téléphone appairé, dont la ligne dit « does not cook » (#1162)",
  largeur: 1440,
  hauteur: 900,
  etapes: [],
  donnees: accueil,
};
