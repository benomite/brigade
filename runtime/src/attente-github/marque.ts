// Ce qu'une issue en WAITING attend, relu de sa marque `<!-- brigade:waiting … -->` (#3074), sans E/S ni import lourd :
// `waiting`, la retenue et `status` la lisent par attente-github.ts, et la lecture du rail de l'app la lit ici, pour dire
// qui retient un ticket qui l'attend (#3761).
import type { Commentaire } from "../github.ts";

// Ceux dont un commentaire fait foi : le propriétaire du dépôt, les membres de
// son organisation, ses collaborateurs. Tout le monde peut commenter une issue
// publique, et une fiche dit quoi cuisiner.
export const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];

// Ce qu'un ticket attend : quoi, de qui, et la relance (ISO). `backOnFollowUp` :
// la cuisine l'y a mis d'après les mots de son cook (attente/attente-par-le-cook.ts,
// #3814), et il rentre seul sur le rail à sa relance ; posé par le chef, il y reste.
export type AttenteGitHub = { what: string; who: string; followUp: string; backOnFollowUp?: true };

export const MARQUE = "<!-- brigade:waiting";
const MARQUE_LUE = /^<!-- brigade:waiting (\{.*?\}) -->/;

// Ce qu'attend l'issue, d'après le plus récent commentaire marqué d'un auteur
// du dépôt ; null si aucun ne se lit.
export function attenteDeLIssue(commentaires: readonly Pick<Commentaire, "body" | "association">[]): AttenteGitHub | null {
  for (const { body, association } of [...commentaires].reverse()) {
    if (!DE_CONFIANCE.includes(association)) continue;
    const brut = MARQUE_LUE.exec(body)?.[1];
    if (brut === undefined) continue;
    try {
      const { what, who, followUp, backOnFollowUp } = JSON.parse(brut) as Record<string, unknown>;
      if (typeof what === "string" && typeof who === "string" && typeof followUp === "string" && !Number.isNaN(Date.parse(followUp))) return { what, who, followUp, ...(backOnFollowUp === true ? { backOnFollowUp } : {}) };
    } catch {
      // Une marque illisible ne dit rien : la précédente, s'il y en a une.
    }
  }
  return null;
}
