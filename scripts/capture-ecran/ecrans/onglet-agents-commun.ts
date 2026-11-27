// The Agents tab of « parade » (ticket 4569): what the new kitchen runs, frozen — a cook on a `taken` ticket, the pass on an
// `in-pass` one, the manager at work on its station. The `onglet-agents*` screens start from it.
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const IL_Y_A = (minutes: number) => new Date(Date.parse(MAINTENANT) - minutes * 60_000).toISOString();
export const AU_TRAVAIL = {
  agents: [
    { agent: "cook", ticket: 4569, since: IL_Y_A(42), station: "box" },
    { agent: "cook", ticket: 4570, since: IL_Y_A(7), station: "box" },
    { agent: "pass", ticket: 4561, since: IL_Y_A(3), station: "box" },
    { agent: "manager", ticket: null, since: null, station: "box" },
  ],
  stations: [],
};

// Les données de l'écran ; `reponse` remplace ce que le pont rend pour `agentsAtWork`.
export function donnees(reponse: unknown = AU_TRAVAIL): Donnees {
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), agentsAtWork: reponse },
    envois: cuisine(RENDUS),
  };
}

export const OUVRIR = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet > button:nth-child(3)" }];
