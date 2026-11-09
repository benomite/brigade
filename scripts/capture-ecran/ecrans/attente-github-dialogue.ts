// Le même rail (#3075), « waiting for… » touché sur la carte de #41 : le formulaire — ce qu'elle attend, de qui, la
// relance proposée à sept jours —, « put in WAITING » et « Cancel ».
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE, TODO } from "./attente-github-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3075), « waiting for… » touché sur #41 : le formulaire sur la carte — quoi, de qui, la relance à sept jours",
  largeur: 2200,
  hauteur: 1000,
  etapes: [OUVRIR_PARADE, { cliquer: `${TODO} li.bon:first-of-type button[data-attente="attente-poser"]` }],
  donnees,
};
