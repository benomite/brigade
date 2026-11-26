// Le contrôle de park (#4281), ouvert sous #16 dans le TODO du chef : qui, pour quoi, jusqu'à quand — une date ou un fait —,
// « park » et « unpark ».
import type { Ecran } from "./commun.ts";
import { donneesDuTodoParked } from "./parked-todo.ts";

export const ecran: Ecran = {
  dit: "Le TODO de « parade » (#4281) : « park or unpark… » ouvert sous #16 — qui, pour quoi, jusqu'à quand, « park » et « unpark »",
  largeur: 1900,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: 'li[data-ticket="16"] button[data-action="open-park"]' }],
  donnees: donneesDuTodoParked,
};
