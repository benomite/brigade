// L'onglet Agents de « parade » (ticket 4224), un clic sur Manager : ses derniers gestes, chacun avec sa raison.
import { ongletDesAgents } from "./onglet-agents-commun.ts";

export const ecran = ongletDesAgents("L'onglet Agents de « parade » : les derniers gestes de Manager ouverts, chacun avec sa raison (#4224)", [{ cliquer: 'article[data-agent="manager"] .nom-de-l-agent' }]);
