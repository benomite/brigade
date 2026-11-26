// La page de « parade », confiée à sa box, dont l'accès au dépôt est refusé (#1119) : à la place de « prepares it
// within a minute », une phrase donne la raison et le geste du chef. Le refus est celui que la box publie (#1117).
import type { AccesBloque } from "../../../app/src/projets/demande.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const ACCES: AccesBloque = {
  bloque: "fetch",
  raison: "box cannot fetch from benomite/parade: github.com asks for a username and no credential helper answers (git: fatal: could not read Username for 'https://github.com').",
  geste: "Run `gh auth setup-git` on box, under the account that runs it.",
};

export const ecran: Ecran = {
  dit: "L'espace de « parade » dont l'accès au dépôt est refusé : la raison et le geste `gh auth setup-git`, en une phrase (#1119)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, acces: ACCES }),
};
