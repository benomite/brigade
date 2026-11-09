// Le rail de « parade », le backlog de la bande cliqué (#1836, #3013) : ses comptes dans sa bulle, et la colonne
// Backlog dépliée à gauche de « On the rail » — les cartes du rail, groupées par état, triées par `prio:`, chacune
// disant en une ligne ce qui la retient. Les données sont celles de `rail-backlog`.
import type { Ecran } from "./commun.ts";
import { donnees } from "./rail-backlog.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade », le backlog de la bande cliqué : ses comptes au survol, la colonne Backlog dépliée à gauche de « On the rail »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .bande-backlog" }],
  donnees,
};
