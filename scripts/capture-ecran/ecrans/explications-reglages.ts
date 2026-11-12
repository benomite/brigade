// Les explications des mots de la cuisine sous Settings (#3308) : le chef les a toutes vues — la rangée le dit, son aide
// au survol, et « show all the explanations again » les remontre toutes, sur tous ses appareils.
import { ecran as recurrents } from "./recurrents.ts";
import type { Ecran } from "./commun.ts";

const TOUS = ["rail", "pass", "cook", "second", "TODO", "WAITING"];

export const ecran: Ecran = {
  ...recurrents,
  hauteur: 1600,
  dit: "Les réglages de « parade », le chef ayant vu les six explications (#3308) : sous ses tickets récurrents, « Explanations of the kitchen's words », « 6 of 6 seen » et « show all the explanations again »",
  donnees: () => {
    const donnees = recurrents.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, lireLesExplications: { vus: TOUS }, marquerUneExplication: { vus: TOUS } } };
  },
};
