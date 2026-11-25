// Un ticket marqué pour un cook humain (#4276, règle 6 de
// docs/superpowers/specs/2026-11-24-simplified-process.md) : ce que seul un humain
// peut faire — le chef, le client, un collègue — est pris par cet humain, sur le
// même rail. La marque est sur GitHub seul : le label `human-cook` et l'assignee
// de l'issue. Aucune station ne prend un ticket qui la porte ; quand l'humain ouvre
// la PR de sa branche, elle entre en pass comme celle d'un cook (livraison.ts).
//
// Le geste du chef qui la pose : `rail human <ticket> [qui]`
// (sortie-attente-capacite/sortie.ts).
import { brancheDuTicket } from "../brigade-github.ts";
import type { GitHub } from "../github.ts";
import { etapesDeLaPass } from "./etapes-de-la-pass.ts";

export const LABEL_COOK_HUMAIN = "human-cook";

// Ce que la marque écrit sur GitHub.
export type GitHubDeLaMarque = {
  ajouterLabel(ticket: number, label: string): Promise<void>;
  assigner(ticket: number, login: string): Promise<void>;
  commenter(ticket: number, corps: string): Promise<void>;
};

// Le client GitHub du runtime, vu par la marque. Un client qui ne sait pas
// assigner (seul le client réel le porte) n'assigne rien, comme partout ailleurs.
export const marqueSurGitHub = (github: Pick<GitHub, "labelliser" | "assigner" | "commenter">): GitHubDeLaMarque => ({
  ajouterLabel: (ticket, label) => github.labelliser(ticket, [label]),
  assigner: async (ticket, login) => github.assigner?.(ticket, [login]),
  commenter: (ticket, corps) => github.commenter(ticket, corps),
});

// Le mot à l'humain, sur l'issue : le ticket est son travail, et sa PR passe la
// même pass qu'un cook.
// `qui` : à qui il s'adresse — `@<login>`, ou « the chef » quand aucun chef n'est résolu.
export function motAuCookHumain(ticket: number, login: string, qui = `@${login}`): string {
  const etapes = etapesDeLaPass({ auteur: login, labels: [LABEL_COOK_HUMAIN] }).join(", then ");
  return [
    `**${qui}, this ticket is yours.** Only a human can do this work, so it is your work, on the same rail: no cook takes it.`,
    "",
    `When it is ready, open your pull request from the branch \`${brancheDuTicket(ticket)}\`, with \`Closes #${ticket}\`. It goes through the same pass as a cook's: ${etapes}.`,
  ].join("\n");
}

// Marque le ticket pour `login` : le label, l'assignee, puis un seul commentaire.
// Sans `login` — aucun chef résolu (chef/chef.ts) —, rien n'est assigné,
// et le commentaire s'adresse au chef.
export async function marquerPourUnHumain({ ticket, login, github }: { ticket: number; login: string | null; github: GitHubDeLaMarque }): Promise<void> {
  await github.ajouterLabel(ticket, LABEL_COOK_HUMAIN);
  if (login !== null) await github.assigner(ticket, login);
  await github.commenter(ticket, login === null ? motAuCookHumain(ticket, "chef", "the chef") : motAuCookHumain(ticket, login));
}
