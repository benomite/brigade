// Le même rail (#3075), la fiche de #41 ouverte depuis TODO : « waiting for… » y est aussi.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE, TODO } from "./attente-github-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3075), la fiche de #41 ouverte depuis TODO : « waiting for… » sur la fiche",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE, { cliquer: `${TODO} li.bon:first-of-type` }],
  donnees,
};
