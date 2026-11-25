// La carte du closer de « parade » sur l'onglet Agents (ticket 4117), son fil ouvert : ses chiffres en mots simples — ce qu'il voit sur
// la base, avec ce que chacun veut dire —, ses réglages, ses derniers gestes avec leur raison.
import type { Ecran } from "./commun.ts";
import { ecran as agents } from "./espace-projet-agents.ts";

export const ecran: Ecran = {
  ...agents,
  dit: "L'onglet Agents de « parade » : le closer, ses chiffres en mots simples, ses réglages et son fil ouvert",
  etapes: [...agents.etapes, { cliquer: '#agents-du-projet section[data-agent="closer"] > button' }],
};
