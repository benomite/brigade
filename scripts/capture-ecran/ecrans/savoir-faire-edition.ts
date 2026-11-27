// L'onglet Know-how de « parade » (#4570), une entrée ouverte sur place : son texte dans un champ, en cours de frappe ; aucun « save ».
import type { Ecran } from "./commun.ts";
import { ENTREES, OUVRIR_LE_SAVOIR_FAIRE, savoirFaire } from "./savoir-faire-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Know-how de « parade », une entrée réécrite sur place, avant que le champ ne s'applique",
  largeur: 1440,
  hauteur: 900,
  etapes: [
    ...OUVRIR_LE_SAVOIR_FAIRE,
    { cliquer: "#rail .entree-du-savoir[data-ligne='3'] .editer" },
    { saisir: "#rail .entree-du-savoir[data-ligne='3'] input", texte: "Run the app's typecheck before committing, and the tests of what you changed." },
  ],
  donnees: savoirFaire(ENTREES),
};
