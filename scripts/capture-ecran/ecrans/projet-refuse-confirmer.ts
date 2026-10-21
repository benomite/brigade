// La page de « parade » refusé par sa box, le bouton du remède cliqué (#1205) : il retire quelque chose de la
// configuration de la station, donc la page demande d'abord confirmation, avec la même phrase.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./cuisine-demenagee.ts";
import { COOKS, PORT, REMEDE, refuse } from "./projet-refuse.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » refusé par sa box, le bouton du remède cliqué : la confirmation, avec la phrase du remède (#1205)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, COOKS, REMEDE],
  donnees: () => donnees(refuse(PORT)),
};
