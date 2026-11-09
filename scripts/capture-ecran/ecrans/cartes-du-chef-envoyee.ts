// Le premier choix de la carte touché (ticket 2915, Phone.dc.html) : le process principal poste la réponse sur l'issue
// (`repondreCarte` rend le commentaire), et l'écran dit « Sent to the kitchen. ».
import type { Ecran } from "./commun.ts";
import { CARTE, ecran as carte } from "./cartes-du-chef-carte.ts";
import { donneesDe, QUESTION } from "./demo-commun.ts";

export const ecran: Ecran = {
  ...carte,
  dit: "Le téléphone, 390 × 844 : le premier choix de la carte de #21 touché — « Sent to the kitchen. », avec le retour à la liste",
  etapes: [{ cliquer: CARTE }, { cliquer: ".choix-du-chef.recommande" }],
  donnees: () => donneesDe(QUESTION, { repondreCarte: { commentaire: 9001 } }),
};
