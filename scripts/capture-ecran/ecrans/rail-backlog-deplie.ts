// Le rail de « parade », le titre du bandeau Backlog cliqué (#3460) : tout le backlog déplié en liste, groupé par état —
// ce qui t'attend d'abord —, trié par priorité dans chaque groupe. Les données sont celles de `rail-backlog`.
import type { Ecran } from "./commun.ts";
import { donnees } from "./rail-backlog.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade », le titre du bandeau Backlog cliqué : tout le backlog en liste, groupé par état, ce qui t'attend d'abord",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .backlog-band-titre" }],
  donnees,
};
