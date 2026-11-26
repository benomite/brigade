// Le TODO de « parade » avant le ticket 4474 : #41 porte `parked:chef`, mais le TODO ne lisait pas ce label — rien ne
// l'attend (todo-parked-chef.ts, la même cuisine).
import type { Ecran } from "./commun.ts";
import { donneesDe, ecran as carte } from "./todo-parked-chef.ts";

export const ecran: Ecran = {
  ...carte,
  dit: "Le TODO de « parade » avant le ticket 4474 : #41 porte parked:chef, mais le TODO ne lisait pas ce label — aucune carte",
  // Le rail ramené à sa première colonne, comme sur la capture d'après : celle où la carte de #41 se pose.
  etapes: [...carte.etapes, { defiler: '#rail [data-ticket="21"]' }],
  donnees: () => donneesDe([]),
};
