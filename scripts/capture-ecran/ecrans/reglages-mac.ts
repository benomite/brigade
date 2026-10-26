// Les réglages de « parade » (Settings) sur un Mac (#1700) : les trois groupes — le projet, cette
// machine, toi —, chaque réglage avec sa valeur et son contrôle.
import { donnees, LARGEURS, OUVRIR } from "./reglages-commun.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  dit: "Les réglages de « parade » sur un Mac : le projet, cette machine, toi — chaque réglage, sa valeur et son contrôle",
  ...LARGEURS.mac,
  etapes: OUVRIR,
  donnees: () => donnees("mac"),
};
