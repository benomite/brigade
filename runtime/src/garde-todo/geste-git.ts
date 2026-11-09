// Le geste git n'est jamais une carte de TODO : « bring origin/main into
// cook/2914-github », « merge PR #2907 » ne demandent aucune décision au chef
// (CLAUDE.md, « Brigade's goal: autonomy »). La porte (carte-todo.ts,
// `entrerDansTodo`) appelle `gesteGit` avant tout : une carte dont le geste est
// un merge, un rebase, un fetch, une mise à jour de branche ou une relance n'est
// pas créée, et la proposition prend le chemin de réparation du manager — un
// ticket `fix` sur la cuisine (`reparationDuGeste`), que l'appelant ouvre.
import { LABEL } from "../github.ts";
import type { Proposition } from "../carte-todo.ts";
import { OBJET } from "./garde.ts";

const VERBES = "merge|rebase|fetch|pull|sync|update|bring|re-?run|re-?trigger|re-?launch|restart";
// L'ordre ou la demande de permission, en tête de la ligne : une question de
// produit qui nomme ces mots (« Which merge strategy… ? ») n'en est pas un.
const DEMANDE = new RegExp(`^\\W*(?:(?:please|can|could|may|should|shall|do|would)\\b[^.?]{0,30}?\\b)?(${VERBES})\\b(.*)$`, "i");
// Ce sur quoi le geste porte, en plus de l'objet de garde.ts : la base, un remote, une branche de cook.
const OBJET_GIT = /\b(?:origin|upstream|main|master|cook\/\S+)/i;

// Le verbe du geste git que dit cette ligne, ou null.
function verbeDuGeste(ligne: string): string | null {
  const lu = DEMANDE.exec(ligne.trim());
  if (!lu) return null;
  const reste = lu[2] ?? "";
  return OBJET.test(reste) || OBJET_GIT.test(reste) ? (lu[1] ?? "").toLowerCase() : null;
}

// Le geste git que la proposition demande, ou null. Lit la question seule : les
// choix d'une carte de design peuvent dire « merge » (la suite d'une
// validation), ce n'est pas ce qu'elle demande.
export function gesteGit({ enonce }: Proposition): string | null {
  return verbeDuGeste(enonce ?? "");
}

// Le ticket `fix` que le manager ouvre sur la cuisine à la place de la carte.
export type ReparationDuGeste = { titre: string; corps: string; labels: string[] };

const CALIBRAGE = { model: "sonnet", effort: "medium" } as const;
export const LABELS_DE_REPARATION = [LABEL, "fix", "prio:1", `model:${CALIBRAGE.model}`, `effort:${CALIBRAGE.effort}`];

export function reparationDuGeste(geste: string, proposition: Proposition, ticket: number): ReparationDuGeste {
  const question = (proposition.enonce ?? "").replace(/\s+/g, " ").trim();
  return {
    titre: `Do the git gesture of #${ticket} (${geste}) — no decision is asked of the chef`,
    corps: [
      "## Context",
      "",
      `A TODO card for the chef asked, on #${ticket}: “${question}”. That is a git gesture (${geste}), not a decision: the kitchen does it, so no card was created and this \`fix\` ticket takes its place.`,
      "",
      "## Acceptance criteria",
      "",
      "- The gesture is done where it lives (the branch, the PR, the CI) and said on the issue, or the issue says why it cannot be.",
      `- #${ticket} goes on from there: nothing is asked of the chef.`,
    ].join("\n"),
    labels: LABELS_DE_REPARATION,
  };
}
