// L'onglet Agents de « parade » (ticket 4224) : le niveau d'autonomie de Manager changé, et refusé (400) — la rangée dit la
// raison, et garde l'ancienne valeur.
import { AUTONOMIE_DU_MANAGER, ongletDesAgents } from "./onglet-agents-commun.ts";

export const ecran = ongletDesAgents("L'onglet Agents de « parade » : un changement d'autonomie refusé, sa raison dite, l'ancienne valeur gardée (#4224)", [{ saisir: AUTONOMIE_DU_MANAGER, texte: "act" }], {
  statut: 400,
  corps: { reason: "autonomy must be one of observe, propose, act — the chef holds manager on propose this week" },
});
