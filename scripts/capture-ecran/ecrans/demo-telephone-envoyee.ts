// Scène 7 de la démo (ticket 2875) : le chef touche le premier choix de la carte de #21, sur le téléphone. Le process
// principal poste sa réponse sur l'issue (`repondreCarte` rend le commentaire) : la carte rappelle la réponse et dit
// qu'elle attend la cuisine.
import type { Ecran } from "./commun.ts";
import { CARTE, ecran as carte } from "./demo-telephone-carte.ts";
import { donneesDe, QUESTION } from "./demo-commun.ts";

export const ecran: Ecran = {
  ...carte,
  dit: "La démo, scène 7 : le premier choix de la carte de #21 touché sur le téléphone — la réponse est postée, la carte dit qu'elle attend la cuisine",
  etapes: [...carte.etapes.slice(0, 1), { cliquer: `${CARTE} .choix-carte > :first-child .choix` }, { defiler: CARTE }],
  donnees: () => donneesDe(QUESTION, { repondreCarte: { commentaire: 9001 } }),
};
