// La garde d'autonomie de TODO : une carte dont la demande est une action
// technique — merger une PR, rebaser une branche, relancer une CI — n'est jamais
// une question pour le chef (CLAUDE.md, « Brigade's goal: autonomy »). La porte
// (carte-todo.ts, `jugerCarte`) l'appelle : la carte est refusée avec la raison
// de cette garde, écrite au journal (`todo.refused`), et renvoyée au triage,
// qui la rend au manager ou à un cook.
import type { Proposition } from "../carte-todo.ts";

const ACTION = /\b(merge|rebase|re-?run|re-?trigger|re-?launch|restart)\b/i;
// Ce sur quoi l'action porte : une PR, une branche, une CI.
export const OBJET = /(?:\b(?:prs?|pull requests?|branch(?:es)?|ci|pipelines?|workflows?|checks?|builds?|jobs?)\b|#\d+)/i;
// Une demande technique est un ordre (« Merge PR #2908 », « Please rebase… ») ou
// une demande de permission (« Can I merge… ? ») : une question de produit qui
// nomme ces mots (« Which merge strategy… ? ») n'en est pas une.
const DEMANDE = /^\W*(?:(?:please|can|could|may|should|shall|do|would)\b[^.?]{0,30}?\b)?(merge|rebase|re-?run|re-?trigger|re-?launch|restart)\b(.*)$/i;

// Le mot d'action technique que dit cette ligne, ou null.
function actionTechnique(ligne: string): string | null {
  const lu = DEMANDE.exec(ligne.trim());
  if (!lu || !ACTION.test(lu[1] ?? "")) return null;
  return OBJET.test(lu[2] ?? "") ? (lu[1] ?? "").toLowerCase() : null;
}

// Pourquoi cette proposition est une demande technique, ou null quand elle ne
// l'est pas. Lit la question seule : les choix d'une carte de design peuvent
// dire « merge » (la suite d'une validation), ce n'est pas ce qu'elle demande.
export function refuserDemandeTechnique({ enonce }: Proposition): string | null {
  const action = actionTechnique(enonce ?? "");
  if (action === null) return null;
  return `technical ask (“${action}”): a merge, a rebase or a CI rerun is never a question for the chef — it goes back to the manager or a cook`;
}
