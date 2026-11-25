// L'onglet Agents de « parade » (ticket 4224) : le niveau d'autonomie de Manager changé, son PUT en route — la rangée dit
// « changing… » et son champ attend.
import { AUTONOMIE_DU_MANAGER, ongletDesAgents } from "./onglet-agents-commun.ts";

export const ecran = ongletDesAgents("L'onglet Agents de « parade » : l'autonomie de Manager en train de changer (#4224)", [{ saisir: AUTONOMIE_DU_MANAGER, texte: "act" }], { __enAttente: true });
