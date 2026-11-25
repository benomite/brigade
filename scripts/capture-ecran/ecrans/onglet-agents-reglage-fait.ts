// L'onglet Agents de « parade » (ticket 4224) : le niveau d'autonomie de Manager changé et accepté — la rangée montre la
// nouvelle valeur, quand et par qui elle a été changée.
import { AUTONOMIE_DU_MANAGER, ongletDesAgents } from "./onglet-agents-commun.ts";

export const ecran = ongletDesAgents("L'onglet Agents de « parade » : l'autonomie de Manager changée, avec quand et par qui (#4224)", [{ saisir: AUTONOMIE_DU_MANAGER, texte: "act" }]);
