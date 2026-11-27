// Le TODO de « parade » avant le ticket 4593 : #41 porte `parked:chef` et le TODO le montre, mais son entrée n'a aucun bouton
// Answer — la carte qui le porte n'est plus posée sur le kanban de la nouvelle cuisine (todo-parked-chef.ts, la même cuisine).
import type { Ecran } from "./commun.ts";
import { ATTEND, donneesDe, ecran as carte } from "./todo-parked-chef.ts";

export const ecran: Ecran = {
  ...carte,
  dit: "Le TODO de « parade » avant le ticket 4593 : #41 parked:chef y est, sans bouton Answer",
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: ".ligne-du-todo" }],
  donnees: () => donneesDe(ATTEND),
};
