// Ce que les écrans de l'onglet Agents (ticket 4224) partagent : l'espace de « parade », son onglet Agents ouvert, et l'API
// des agents qui rend ce que le faux du test rend (app/test/agents/faux-api.ts) — un agent au repos (Manager), un au travail
// (Cooks, sur #4224), un cassé (Closer). Ce fichier n'exporte pas `ecran` : il n'est pas un écran.
import { AGENTS, GESTES, QUAND, QUI, REGLAGES } from "../../../app/test/agents/faux-api.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const OUVRIR_LES_AGENTS: Etape[] = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet > button:nth-child(3)" }];
export const AUTONOMIE_DU_MANAGER = 'article[data-agent="manager"] [data-cle="autonomy"] select';

// La réponse de l'API à chaque demande, par la demande — le premier argument de `apiDesAgents`.
export function api(put: unknown = { statut: 200, corps: { ...REGLAGES.manager?.[1], value: "act", source: "app", changedAt: QUAND, changedBy: QUI } }): Record<string, unknown> {
  const selon: Record<string, unknown> = { "GET /api/agents": { statut: 200, corps: AGENTS } };
  for (const { id } of AGENTS) {
    selon[`GET /api/agents/${id}/settings`] = { statut: 200, corps: { fields: REGLAGES[id] ?? [] } };
    selon[`GET /api/agents/${id}/gestures`] = { statut: 200, corps: GESTES[id] ?? [] };
  }
  selon["PUT /api/agents/manager/settings"] = put;
  return { __selon: selon };
}

export function ongletDesAgents(dit: string, etapes: Etape[] = [], put?: unknown): Ecran {
  return {
    dit,
    largeur: 1440,
    hauteur: 900,
    etapes: [...OUVRIR_LES_AGENTS, ...etapes],
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), apiDesAgents: api(put) },
      envois: cuisine(RENDUS),
    }),
  };
}
