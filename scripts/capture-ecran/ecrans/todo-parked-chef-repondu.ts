// La carte de #41, parked:chef (ticket 4474) : la réponse du chef tapée, Answer cliqué — le process principal la poste sur
// l'issue et retire `parked:chef` (`repondreCarte`), la carte rappelle la réponse.
import type { Ecran } from "./commun.ts";
import { ANSWER_DE_41, CHAMP_DE_41, ecran as carte } from "./todo-parked-chef.ts";

export const ecran: Ecran = {
  ...carte,
  dit: "La carte de #41, parked:chef (ticket 4474) : la réponse tapée, Answer cliqué — postée sur l'issue, parked:chef retiré, la carte rappelle la réponse",
  etapes: [...carte.etapes, { saisir: CHAMP_DE_41, texte: "Keep it in the free tier, capped at 1,000 rows." }, { cliquer: ANSWER_DE_41 }],
  donnees: () => ({ ...carte.donnees(), reponses: { ...carte.donnees().reponses, repondreCarte: { repondue: true, dit: "answer posted on #41 (resume): `parked:chef` removed", commentaire: 9001 } } }),
};
