// La page du coût de tous les projets, avec les livraisons de « parade » et leur moteur : #7 sur une clé d'API Claude avec son prix, #9 (Codex) sans (#3747).
import type { Ecran } from "./commun.ts";
import { lu } from "./cout.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PROJETS } from "./cuisine-figee.ts";
import { AVEC_MOTEUR } from "./livraison-moteur-commun.ts";
import { cuisine } from "./commun.ts";
import { SETTINGS } from "./projet-sante.ts";

export const ecran: Ecran = {
  dit: "La page du coût de tous les projets : les tickets les plus chers, dont une livraison sur clé d'API Claude, au prix de 3,27 $",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, { cliquer: "#couts-de-tous button" }],
  donnees: () => {
    const base = donnees(SUR_LA_BOX);
    return { ...base, envois: { ...base.envois, ...cuisine(AVEC_MOTEUR), onglet: { ...base.envois.onglet, "undefined/couts": PROJETS.map(({ nom }) => lu(nom)) } } };
  },
};
