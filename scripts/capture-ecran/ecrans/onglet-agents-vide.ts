// The Agents tab of « parade » with nothing at work (ticket 4569): « No agent at work », and a station that cannot be read, said.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./onglet-agents-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Agents de « parade » : aucun agent au travail, et une station illisible dite en une phrase (#4569)",
  largeur: 1440,
  hauteur: 900,
  etapes: OUVRIR,
  donnees: () => donnees({ agents: [], stations: [{ station: "box", why: "box could not be read: its runtime does not serve the agents yet." }] }),
};
