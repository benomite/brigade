// Une épique dont tous les sous-tickets listés sont fermés est finie : on la ferme,
// avec un commentaire qui les nomme. Ce qu'une routine humaine faisait à la main.
import type { GitHub } from "../github.ts";

export type GitHubDeLEpique = Pick<GitHub, "issue" | "commentaires" | "commenter" | "fermerIssue">;

export type Cloture =
  // L'épique n'a pas été touchée : `raison` dit pourquoi.
  | { fermee: false; raison: "deja-fermee" | "introuvable" | "sans-sous-ticket" | "sous-ticket-ouvert" }
  | { fermee: true; sousTickets: number[] };

const NUMERO = /(?<![\w&/#])#([1-9]\d*)\b/g;

// Les tickets que le texte nomme par leur numéro (`#12`), dans l'ordre et sans doublon.
export function numerosNommes(texte: string): number[] {
  const numeros = new Set<number>();
  for (const trouve of texte.matchAll(NUMERO)) {
    const numero = Number(trouve[1]);
    if (Number.isSafeInteger(numero)) numeros.add(numero);
  }
  return [...numeros];
}

export async function fermerEpiqueFinie(github: GitHubDeLEpique, epique: number): Promise<Cloture> {
  const issue = await github.issue(epique);
  if (!issue) return { fermee: false, raison: "introuvable" };
  if (issue.state === "closed") return { fermee: false, raison: "deja-fermee" };
  const commentaires = await github.commentaires(epique);
  const textes = [issue.body ?? "", ...commentaires.map((commentaire) => commentaire.body)];
  const sousTickets = [...new Set(textes.flatMap(numerosNommes))].filter((numero) => numero !== epique);
  if (sousTickets.length === 0) return { fermee: false, raison: "sans-sous-ticket" };
  for (const numero of sousTickets) {
    // Un ticket qu'on ne sait pas lire n'est pas fermé.
    if ((await github.issue(numero))?.state !== "closed") return { fermee: false, raison: "sous-ticket-ouvert" };
  }
  const nommes = sousTickets.map((numero) => `#${numero}`).join(", ");
  await github.commenter(epique, `All the sub-tickets this epic lists are closed (${nommes}): closing the epic.`);
  await github.fermerIssue(epique);
  return { fermee: true, sousTickets };
}
