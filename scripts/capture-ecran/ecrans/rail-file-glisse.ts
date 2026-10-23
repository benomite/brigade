// La même file, #24 (`prio:2`) en train de glisser vers le haut, au-dessus de #23 (`prio:1`) : la carte s'efface à demi,
// et le trait d'accent dit qu'elle atterrira juste avant #23 (ticket 1347). Rien n'est encore lâché.
import type { Ecran } from "./commun.ts";
import { CARTE, FILE as file } from "./rail-file-commun.ts";

export const ecran: Ecran = {
  ...file,
  dit: "La même file, #24 en train de glisser au-dessus de #23 : la carte s'efface à demi, un trait dit qu'elle atterrira juste avant #23",
  etapes: [...file.etapes, { glisser: CARTE(4), sur: CARTE(2) }],
};
