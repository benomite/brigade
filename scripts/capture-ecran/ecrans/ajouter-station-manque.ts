// Le même ajout (#1288), quand la première station ne dit pas combien de cooks elle fait tourner : « Add » confirmé,
// le champ des cooks se montre, posé de ce que l'app devine, avec la ligne qui le nomme.
import type { Ecran } from "./commun.ts";
import { OUVRIR } from "./cuisine-demenagee.ts";
import { AJOUTER, avantLApp, COCHER } from "./ajouter-station.ts";

export const ecran: Ecran = {
  dit: "L'ajout d'une station quand la première ne dit pas son plafond de cooks : le champ des cooks se montre, posé, et la phrase le nomme (#1288)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, AJOUTER, COCHER, { cliquer: '#stations-du-projet form button[type="submit"]' }],
  donnees: () => avantLApp({ confierAUneStation: { signales: { cooks: "box does not say how many cooks it may run at once for parade: give the cook cap." }, manque: ["cooks"] } }),
};
