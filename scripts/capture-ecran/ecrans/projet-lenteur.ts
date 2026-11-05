// La page de « parade » avec sa ligne du plus lent (#2351, épique #2337) : la phrase de `nommerLePlusLent`, que la
// station publiera sous `lenteur` du projet vu.
import type { ProjetVu } from "../../../app/src/projets/projets.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » avec la ligne de ce qui est le plus lent dans le projet (#2351)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, lenteur: { partie: "ci", phrase: "CI: 7 min median", chiffres: "CI median 7 min over the last 10 tickets" } } as ProjetVu),
};
