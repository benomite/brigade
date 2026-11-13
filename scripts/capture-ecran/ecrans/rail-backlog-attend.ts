// Le rail de « parade », l'étiquette rouge cliquée (#3460) : le besoin qui t'attend, son détail sous le bandeau, avec sa
// carte de TODO — la question qu'il pose et le bouton qui y répond. Les données sont celles de `rail-backlog`.
import type { Ecran } from "./commun.ts";
import { donnees } from "./rail-backlog.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade », l'étiquette rouge de #51 cliquée : son détail, avec la question qu'il pose et son bouton",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#rail .backlog-tag[data-ticket="51"]' }],
  donnees,
};
