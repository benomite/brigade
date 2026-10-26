// Les réglages de « parade » (Settings) sur un PC sous Windows (#1700) : les trois groupes — le projet, cette
// machine, toi —, chaque réglage avec sa valeur et son contrôle.
import { donnees, LARGEURS, OUVRIR } from "./reglages-commun.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  dit: "Les réglages de « parade » sur un PC sous Windows : le projet, cette machine, toi — chaque réglage, sa valeur et son contrôle",
  ...LARGEURS.pc,
  etapes: OUVRIR,
  donnees: () => donnees("pc"),
};
