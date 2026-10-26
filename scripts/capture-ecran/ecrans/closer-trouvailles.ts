// Le closer de « parade », sur son onglet Cooks, la liste de ce que le closer a repéré dépliée (#990) : chaque
// doublon et chaque export mort, avec son fichier et ses lignes. Mêmes données que closer.ts.
import { ecran as closer } from "./closer.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...closer,
  dit: "Le closer de « parade », sur son onglet Cooks, la liste de ce que le closer a repéré dépliée : fichier et lignes de chaque trouvaille",
  etapes: [...(closer.etapes ?? []), { cliquer: ".closer-trouvailles .deplier" }],
};
