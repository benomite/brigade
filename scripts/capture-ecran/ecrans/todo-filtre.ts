// Le même rail que attente-github (#3075), « TODO (2) » cliqué (#3458) : seules les cartes rouges, celles qui attendent le
// chef, restent dans la colonne de leur étape ; les autres colonnes disent que rien n'y attend le chef.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./attente-github-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul, « TODO (2) » cliqué (#3458) : seules les deux cartes qui attendent le chef, rouges dans On the rail ; les autres colonnes disent que rien n'y attend",
  largeur: 2200,
  hauteur: 760,
  etapes: [OUVRIR_PARADE, { cliquer: "#rail .entree-todo" }],
  donnees,
};
