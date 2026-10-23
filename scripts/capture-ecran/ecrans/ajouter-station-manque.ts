// Le même ajout (#1288), quand ni la première station ni le clone du projet sur ce Mac ne disent son dépôt : « Add »
// cliqué sans rien toucher, la raison se lit en une phrase sous le formulaire, et aucun champ ne paraît (#1307).
import type { Ecran } from "./commun.ts";
import { OUVRIR } from "./cuisine-demenagee.ts";
import { AJOUTER, avantLApp } from "./ajouter-station.ts";

export const ecran: Ecran = {
  dit: "L'ajout d'une station quand ni la première ni le clone ne disent le dépôt : la raison en une phrase, aucun champ de plus (#1288, #1307)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, AJOUTER, { cliquer: '#stations-du-projet form button[type="submit"]' }],
  donnees: () => avantLApp({ confierAUneStation: { signales: { depot: "box does not say which GitHub repository it serves for parade, and neither does its folder on this computer." }, manque: ["depot"] } }),
};
