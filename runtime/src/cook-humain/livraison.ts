// La PR d'un cook humain entre en pass (#4276) : un ticket marqué `human-cook`
// n'est pris par aucune station ; quand l'humain ouvre la PR de sa branche
// (`cook/<n>-github`, que son commentaire lui nomme), la station pose `in-pass`,
// comme à la livraison d'un cook. De là, la même pass la juge — les mêmes étapes,
// dans le même ordre (etapes-de-la-pass.ts) : rien n'est sauté, rien n'est ajouté.
import { LABEL_IN_PASS } from "../github-etat/etats.ts";
import type { PR } from "../github.ts";
import { LimiteGitHubAtteinte } from "../limite-github.ts";
import { LABEL_COOK_HUMAIN } from "./marquer.ts";

export type GitHubDeLaLivraison = {
  prOuverteDuTicket(ticket: number): Promise<Pick<PR, "state" | "merged"> | null>;
  labelliser(ticket: number, labels: string[]): Promise<void>;
};

// Le client du tour de la station, vu par la livraison : la PR ouverte du ticket
// telle que l'instantané du tour la donne, sinon celle de sa branche.
export const enLivraisonDuTour = (github: {
  prOuverteDuTicket?(ticket: number): Promise<Pick<PR, "state" | "merged"> | null>;
  prDuTicket(ticket: number): Promise<Pick<PR, "state" | "merged"> | null>;
  labelliser(ticket: number, labels: string[]): Promise<void>;
}): GitHubDeLaLivraison => ({
  prOuverteDuTicket: (ticket) => (github.prOuverteDuTicket ?? github.prDuTicket).call(github, ticket),
  labelliser: (ticket, labels) => github.labelliser(ticket, labels),
});

// Vrai si la PR de l'humain est ouverte et vient d'entrer en pass.
export async function livrerLaPRDuCookHumain(ticket: number, github: GitHubDeLaLivraison): Promise<boolean> {
  const pr = await github.prOuverteDuTicket(ticket);
  if (pr === null || pr.state !== "open" || pr.merged) return false;
  await github.labelliser(ticket, [LABEL_IN_PASS]);
  return true;
}

// Retire des tickets libres du tour ceux qui sont marqués pour un cook humain —
// aucune station ne les prend —, et fait entrer en pass la PR que l'humain a
// ouverte. Une PR illisible se relit au tour suivant. Vrai si une PR est entrée.
export async function laisserAuxCooksHumains(libres: Array<{ number: number; labels: readonly string[] }>, github: GitHubDeLaLivraison & { avertir(ligne: string): void }): Promise<boolean> {
  const humains = libres.filter(({ labels }) => labels.includes(LABEL_COOK_HUMAIN));
  libres.splice(0, libres.length, ...libres.filter(({ labels }) => !labels.includes(LABEL_COOK_HUMAIN)));
  let entree = false;
  for (const { number } of humains) {
    try {
      if (await livrerLaPRDuCookHumain(number, github)) entree = true;
    } catch (erreur) {
      if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      github.avertir(`the pull request of #${number}, marked for a human cook, could not be read — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return entree;
}
