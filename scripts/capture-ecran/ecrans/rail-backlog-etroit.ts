// Le rail de « parade » sur un écran de téléphone (#3460) : la ligne du bandeau Backlog passe sous son titre et défile de
// côté, sans `+N`. Les données sont celles de `rail-backlog`.
import type { Ecran } from "./commun.ts";
import { donnees } from "./rail-backlog.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade » à la largeur d'un téléphone : le bandeau Backlog défile de côté",
  largeur: 390,
  hauteur: 844,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees,
};
