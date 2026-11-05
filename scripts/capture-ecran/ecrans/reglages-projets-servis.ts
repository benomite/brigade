// Les projets que la station de ce Mac sert (#2359) : parade choisi, cantine non — la ligne « aucun projet » n'est plus.
import { LARGEURS, OUVRIR } from "./reglages-commun.ts";
import { donneesDesProjetsServis } from "./reglages-projets-servis-commun.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  dit: "Les projets que sert la station de ce Mac, dans Settings : parade choisi, cantine non",
  ...LARGEURS.mac,
  hauteur: 1400,
  etapes: OUVRIR,
  donnees: () => donneesDesProjetsServis(["chef/parade"]),
};
