// Le choix de la machine où déménager la cuisine de parade, avec un téléphone appairé (#1162) : il n'y est pas offert.
import type { Ecran } from "./commun.ts";
import { DEMENAGER, OUVRIR } from "./cuisine-demenagee.ts";
import { demenagement } from "./telephone-station.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », « move the kitchen » ouvert, un téléphone appairé qui n'est pas proposé (#1162)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, DEMENAGER],
  donnees: demenagement,
};
