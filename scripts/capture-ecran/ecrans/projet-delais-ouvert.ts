// Le pire dépassement des dernières 24 heures de « parade » ouvert (#4309) : où son temps est passé — cook, gates,
// review, send-backs, waits —, en minutes.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { DELAIS } from "./projet-delais.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade » : le pire dépassement des dernières 24 heures ouvert, ses cinq parts en minutes (#4309)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, { cliquer: "#delais-du-projet li:first-child > button.depassement" }],
  donnees: () => donnees({ ...SUR_LA_BOX, delais: DELAIS }),
};
