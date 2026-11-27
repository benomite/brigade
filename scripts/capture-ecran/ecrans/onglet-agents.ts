// The Agents tab of « parade » (ticket 4569): one line per agent at work — two cooks, the pass, the manager — with its
// ticket, since when and its station; and, in `onglet-agents-vide`, nothing at work.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./onglet-agents-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Agents de « parade » : un cook par ticket pris, la pass sur le ticket en pass, le manager au travail (#4569)",
  largeur: 1440,
  hauteur: 900,
  etapes: OUVRIR,
  donnees: () => donnees(),
};
