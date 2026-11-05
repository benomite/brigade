// Les projets que la station de ce Mac sert (#2359), à l'installation : aucun choisi — la ligne dit que ce Mac ne sert
// aucun projet, et chaque projet de l'app a sa case, décochée.
import { LARGEURS, OUVRIR } from "./reglages-commun.ts";
import { donneesDesProjetsServis } from "./reglages-projets-servis-commun.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  dit: "Les projets que sert la station de ce Mac, dans Settings, à l'installation : aucun choisi, et la ligne qui dit que ce Mac n'en sert aucun",
  ...LARGEURS.mac,
  hauteur: 1400,
  etapes: OUVRIR,
  donnees: () => donneesDesProjetsServis([]),
};
