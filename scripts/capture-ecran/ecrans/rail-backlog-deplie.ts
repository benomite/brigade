// Le rail de « parade », le titre du bandeau Backlog cliqué (#3460, #3589) : le backlog du chef déplié — Next, dans l'ordre
// où la cuisine le servira, puis les idées en réserve et leurs gestes, ce qui a été servi replié en bas. Les données sont
// celles de `rail-backlog`.
import type { Ecran } from "./commun.ts";
import { donnees } from "./rail-backlog.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade », le titre du bandeau Backlog cliqué : Next, puis les idées en réserve, ce qui a été servi replié en bas",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .backlog-band-titre" }],
  donnees,
};
