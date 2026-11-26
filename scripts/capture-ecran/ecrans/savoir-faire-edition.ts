// L'onglet Know-how de « parade » (#4241), une entrée ouverte sur place : son texte dans un champ, en cours de frappe,
// « save » et « Cancel ».
import type { Ecran } from "./commun.ts";
import { ENTREES, OUVRIR_LE_SAVOIR_FAIRE, savoirFaire } from "./savoir-faire-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Know-how de « parade », la deuxième entrée réécrite sur place, avant « save »",
  largeur: 1440,
  hauteur: 900,
  etapes: [
    ...OUVRIR_LE_SAVOIR_FAIRE,
    { cliquer: "#rail .entree:nth-child(2) .gestes > .action:first-child > button" },
    { saisir: "#rail .entree:nth-child(2) textarea", texte: "Never kill a process by its name; keep its pid, and kill that pid only after checking it is still ours." },
  ],
  donnees: savoirFaire(ENTREES),
};
