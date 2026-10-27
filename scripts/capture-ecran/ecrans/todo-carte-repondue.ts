// La même file de « parade », le premier choix de la carte de #21 cliqué (#1281) : la réponse est postée
// sur le tableau de la cuisine, et la carte la dit envoyée, en attente de la cuisine (#1841) — aucun autre clic.
import { ecran as cartes } from "./todo-cartes.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...cartes,
  dit: "La même file, le premier choix de la carte produit de #21 cliqué : la réponse est postée, la carte la dit envoyée, en attente de la cuisine",
  etapes: [...cartes.etapes, { cliquer: '#rail .carte-todo[data-sorte="product"] .action:first-child > button.choix' }],
  donnees: () => {
    const donnees = cartes.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, repondreCarte: { repondue: true, dit: "#21: card answered, choice 1 — cost: your answer is written on the issue; the ticket is queued on the rail, and its cook reads your answer on the issue" } } };
  },
};
