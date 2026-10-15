// Ce que le manager a décidé d'une issue, dans les mots du chef : sa décision,
// et, pour une issue écartée, pourquoi et le geste qui lève l'écart. Lu par
// `manager` (manager-cli.ts) et par ce qui se dit en amont du rail (amont.ts).
import { commandeRendre, NOMS_DE_NATURE, type Ecart, type Nature } from "./evenements/manager.ts";
import type { IssueDuManager } from "./projections/manager.ts";

export function decrire(issue: IssueDuManager): string {
  switch (issue.decision) {
    case "fire": {
      const pose = issue.labels === null ? "labels pas encore posés" : issue.labels.length === 0 ? "rien à poser" : `posé : ${issue.labels.join(", ")}`;
      return `sur le rail, ${issue.model} / ${issue.effort} (${pose}) — ${issue.reason}`;
    }
    case "refused":
      return `refusée (${NOMS_DE_NATURE[issue.kind as Nature] ?? issue.kind}) — ${issue.reason}`;
    case "failed":
      return `jugement illisible — ${issue.reason}`;
    case "aside":
      return `écartée (${issue.reason})${issue.fired ? ", `fire` posé par le chef : laissé, non calibrée" : ""}`;
  }
}

// Pourquoi une issue est écartée, et le geste du chef qui lève l'écart — un
// par motif : seul `chef-changed` se lève par la commande `rendre`.
export function ecart(issue: IssueDuManager): { motif: string; geste: string | null } {
  const label = (nom: string) => ({ motif: `elle porte \`${nom}\``, geste: `retire \`${nom}\` : elle est jugée au réveil suivant` });
  switch (issue.reason as Ecart) {
    case "chef-changed":
      return { motif: "tu y as retiré `fire` ou un calibrage que le manager avait posé", geste: `\`${commandeRendre(issue.ticket)}\` : il la rejuge à neuf` };
    case "blocked-on-human":
    case "question":
    case "decision":
    case "epic":
      return label(issue.reason);
    case "hors-cuisine":
      return { motif: "hors-cuisine — ce ticket ne se sert pas sur cette box ; le pourquoi est sur l'issue", geste: "retire `hors-cuisine` si la box doit le prendre : il est jugé au réveil suivant" };
    case "already-split":
      return { motif: "son corps liste déjà les tickets d'une épique, découpée à la main", geste: "retire cette liste de son corps : l'épique est découpée au réveil suivant" };
    case "roadmap":
      return { motif: "c'est la roadmap du projet", geste: null };
    case "untrusted-author":
      return { motif: "son auteur n'a pas la main sur le dépôt", geste: null };
    default:
      return { motif: issue.reason, geste: null };
  }
}

export const decrireEcart = (issue: IssueDuManager): string => {
  const { motif, geste } = ecart(issue);
  // Pas une attente du chef : rien à « rendre », le ticket est servi ailleurs.
  if (issue.reason === ("hors-cuisine" satisfies Ecart)) return motif;
  return `${motif} — ${geste === null ? "rien ne la rend au manager" : `pour la lui rendre : ${geste}`}`;
};
