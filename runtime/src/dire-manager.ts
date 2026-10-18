// Ce que le manager a décidé d'une issue, dans les mots du chef : sa décision,
// et, pour une issue écartée, pourquoi et le geste qui lève l'écart. Lu par
// `manager` (manager-cli.ts) et par ce qui se dit en amont du rail (amont.ts).
import { commandeRendre, type Ecart, type Nature } from "./evenements/manager.ts";
import type { IssueDuManager } from "./projections/manager.ts";

// Chaque nature telle qu'elle se dit au chef.
const NOMS_DE_NATURE: Record<Nature, string> = {
  ticket: "a ticket",
  epic: "an epic",
  question: "a question",
  decision: "a decision issue",
  incomplete: "an incomplete ticket",
};

export function decrire(issue: IssueDuManager): string {
  switch (issue.decision) {
    case "fire": {
      const pose = issue.labels === null ? "labels not set yet" : issue.labels.length === 0 ? "nothing to set" : `set: ${issue.labels.join(", ")}`;
      return `on the rail, ${issue.model} / ${issue.effort} (${pose}) — ${issue.reason}`;
    }
    case "refused":
      return `refused (${NOMS_DE_NATURE[issue.kind as Nature] ?? issue.kind}) — ${issue.reason}`;
    case "failed":
      return `unreadable judgment — ${issue.reason}`;
    case "aside":
      return `set aside (${issue.reason === ("hors-cuisine" satisfies Ecart) ? `\`${issue.reason}\`` : issue.reason})${issue.fired ? ", `fire` set by the chef: left alone, not calibrated" : ""}`;
  }
}

// Pourquoi une issue est écartée, et le geste du chef qui lève l'écart — un
// par motif : seul `chef-changed` se lève par la commande `return`.
export function ecart(issue: IssueDuManager): { motif: string; geste: string | null } {
  const label = (nom: string) => ({ motif: `it carries \`${nom}\``, geste: `remove \`${nom}\`: it is judged at the next wake-up` });
  switch (issue.reason as Ecart) {
    case "chef-changed":
      return { motif: "you removed `fire` or a calibration the manager had set", geste: `\`${commandeRendre(issue.ticket)}\`: it judges it anew` };
    case "blocked-on-human":
    case "question":
    case "decision":
    case "epic":
      return label(issue.reason);
    case "hors-cuisine":
      return { motif: "it carries `hors-cuisine` — this ticket is not served on this box; the why is on the issue", geste: "remove `hors-cuisine` if the box should take it: it is judged at the next wake-up" };
    case "already-split":
      return { motif: "its body already lists an epic's tickets, split by hand", geste: "remove that list from its body: the epic is split at the next wake-up" };
    case "roadmap":
      return { motif: "it is the project's roadmap", geste: null };
    case "untrusted-author":
      return { motif: "its author has no hand on the repository", geste: null };
    default:
      return { motif: issue.reason, geste: null };
  }
}

export const decrireEcart = (issue: IssueDuManager): string => {
  const { motif, geste } = ecart(issue);
  // Pas une attente du chef : rien à « rendre », le ticket est servi ailleurs.
  if (issue.reason === ("hors-cuisine" satisfies Ecart)) return motif;
  return `${motif} — ${geste === null ? "nothing hands it back to the manager" : `to hand it back to it: ${geste}`}`;
};
