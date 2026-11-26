// L'onglet Agents de « parade » (ticket 4224) : une carte par agent — le closer et le supervisor idle, le manager working on
// #4231, la pass broken, en rouge —, chacune avec son rôle, sa prochaine passe, ses chiffres des 7 derniers jours et leur
// sens, et ses réglages.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./onglet-agents-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Agents de « parade » : une carte par agent — idle, working on #4231, broken —, ses chiffres et ses réglages (#4224)",
  largeur: 1440,
  hauteur: 1500,
  etapes: OUVRIR,
  donnees: () => donnees(),
};
