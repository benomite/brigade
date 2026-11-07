// Une PR prête — approuvée, verte, mergeable — dont le ticket n'a pas `in-pass`
// reçoit le label (#2752). C'est ce qu'une routine humaine faisait à la main.
//
// Module autonome, sans état ni lien avec un projet : tout passe par le GitHub
// qu'on lui donne. Il n'est pas branché sur la boucle de la pass.
import { approuvee, ciDeLaTete, type CommentaireDeVerdict } from "../github-etat/fusion.ts";
import { LABEL_IN_PASS } from "../github-etat/etats.ts";
import { brancheDuTicket } from "../brigade-github.ts";
import type { GitHub } from "../github.ts";

export type GitHubDeLaPrPrete = Pick<GitHub, "tickets" | "prDeBranche" | "ci" | "labelliser"> & {
  commentaires(numero: number): Promise<CommentaireDeVerdict[]>;
};

// Pose `in-pass` sur chaque ticket du sondage dont la PR est ouverte, approuvée
// par son dernier verdict, mergeable (à jour de sa base, sans conflit) et dont
// les checks sont tous verts. Rend les tickets labellisés. Un ticket qui porte
// déjà `in-pass` n'est pas relu ni retouché.
export async function poserInPassSurLesPrsPretes(github: GitHubDeLaPrPrete): Promise<number[]> {
  const sondage = await github.tickets();
  if (sondage.inchange) return [];
  const poses: number[] = [];
  for (const ticket of sondage.issues) {
    if (ticket.labels.includes(LABEL_IN_PASS)) continue;
    const pr = await github.prDeBranche(brancheDuTicket(ticket.number));
    if (pr === null || pr.state !== "open" || pr.merged || pr.enRetard || pr.enConflit) continue;
    if (!approuvee(await github.commentaires(pr.number))) continue;
    if (ciDeLaTete(await github.ci(pr.sha), true) !== "green") continue;
    await github.labelliser(ticket.number, [LABEL_IN_PASS]);
    poses.push(ticket.number);
  }
  return poses;
}
