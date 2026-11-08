// La carte de #21 dans TODO de « parade », à la largeur d'un téléphone (412 × 915), la rangée des colonnes amenée sur elle :
// le même écran que `todo-cartes`, vu comme l'app le dessine sur un téléphone (ticket 2875, sources de la vidéo de démonstration).
import type { Ecran } from "./commun.ts";
import { ecran as source } from "./todo-cartes.ts";

export const ecran: Ecran = {
  ...source,
  dit: "La carte de #21 dans TODO de « parade » à la largeur d'un téléphone (todo-cartes), amenée à l'écran (ticket 2875)",
  largeur: 412,
  hauteur: 915,
  etapes: [...source.etapes, { defiler: '.carte-todo[data-sorte="product"]' }],
};
