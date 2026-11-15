// Une validation demandée sur le ticket qu'elle valide (#3615, épique #3612) :
// plus d'issue à part. Quand la pass retient une livraison verte pour le chef
// — un design (`validation-design/`), un ticket sensible (`sensible/`), toute
// sorte de retenue —, elle pose un commentaire sur l'issue du ticket et le même
// sur sa PR, et met le ticket en attente du chef : le label `chef-todo`, que
// TODO et le téléphone lisent (`github-seul/carte-todo/`).
//
// Le marqueur, que le ticket de la réponse du chef lit : la première ligne du
// commentaire, sur le ticket comme sur la PR, est
//
//   <!-- brigade:todo kind=<sorte> pr=<PR> ticket=<ticket> sha=<sha> -->
//
// `<sorte>` la sorte de carte de TODO de la retenue (`design-validation`,
// `review-before-merge`…), `<PR>` et `<ticket>` des numéros, `<sha>` la tête
// de la PR jugée verte (7 à 40 caractères hexadécimaux). Le commentaire du
// ticket est donc aussi sa carte de TODO, et la demande d'une PR à une tête se
// reconnaît à ce marqueur. Seul le dépôt pose une demande : un commentaire
// d'un autre auteur ne compte pas (`DE_CONFIANCE`).
//
// Le commentaire dit la question, puis le lien de la PR et ce que la sorte y
// ajoute — ce qui était demandé, ce qui a été fait, chaque écran avant et
// après. Le chef n'est mentionné qu'une fois, sur la ligne sous la question —
// TODO lit la première comme la question —, sur le ticket : la copie de la PR
// ne le mentionne pas. Une demande déjà posée sur le
// ticket pour la PR et la tête n'est pas reposée — même levée depuis, le chef
// ayant répondu — : seule la copie de la PR qui manquerait s'écrit.
import { DE_CONFIANCE } from "../alimenter.ts";
import { CHEF_TODO, type Sorte } from "../github-seul/carte-todo/carte-todo.ts";
import type { GitHub } from "../github.ts";

const marqueDeDemande = (sorte: Sorte, pr: number, ticket: number, sha: string) => `<!-- brigade:todo kind=${sorte} pr=${pr} ticket=${ticket} sha=${sha} -->`;

export type Demande = { pr: number; ticket: number; sha: string };

// La demande que la première ligne d'un commentaire porte pour cette sorte ;
// null si ce n'en est pas une.
export function demandeDuCorps(sorte: Sorte, corps: string): Demande | null {
  const lu = new RegExp(`^<!-- brigade:todo kind=${sorte} pr=([1-9][0-9]*) ticket=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->`).exec(corps);
  return lu === null ? null : { pr: Number(lu[1]), ticket: Number(lu[2]), sha: lu[3] ?? "" };
}

type Lu = { body: string; association: string };

// Les commentaires du dépôt qui demandent, pour cette sorte, la validation de
// `pr` à la tête `sha`.
const demandePosee = (sorte: Sorte, commentaires: readonly Lu[], pr: number, sha: string) =>
  commentaires.some((c) => {
    if (!DE_CONFIANCE.includes(c.association)) return false;
    const lue = demandeDuCorps(sorte, c.body);
    return lue !== null && lue.pr === pr && lue.sha === sha;
  });

export type GitHubDeLaDemande = Pick<GitHub, "commenter" | "labelliser"> & { commentaires(numero: number): Promise<Lu[]> };

export type DemandeAPoser = {
  sorte: Sorte;
  ticket: number;
  pr: number;
  sha: string;
  // La question, sur une ligne.
  question: string;
  // Le compte GitHub du chef ; nul, la question ne mentionne personne.
  chef: string | null;
  // Ce qui suit la question : le lien de la PR, le brief, les captures.
  suite: readonly string[];
};

// Le commentaire de la demande : le marqueur, la question, le chef mentionné
// sous elle, puis la suite.
const corpsDeLaDemande = ({ sorte, ticket, pr, sha, question, chef, suite }: DemandeAPoser) =>
  [marqueDeDemande(sorte, pr, ticket, sha), `**${question}**`, ...(chef === null ? [] : [`cc @${chef}`]), ...(suite.length === 0 ? [] : ["", ...suite])].join("\n");

// Pose la demande sur le ticket et sur sa PR, et met le ticket en attente du
// chef. Le label se pose avant le commentaire, comme toute carte de TODO : un
// arrêt entre les deux laisse le label, et la pose suivante écrit le
// commentaire qui manque. Rend ce qui s'est écrit ; rien si la demande était
// déjà posée. Une lecture ou une écriture que GitHub refuse lève : la pass le
// dit, ne merge pas, et réessaie.
export async function demanderSurLeTicket(github: GitHubDeLaDemande, demande: DemandeAPoser): Promise<{ ticket: boolean; pr: boolean }> {
  const { sorte, ticket, pr, sha } = demande;
  const surLeTicket = demandePosee(sorte, await github.commentaires(ticket), pr, sha);
  const surLaPR = demandePosee(sorte, await github.commentaires(pr), pr, sha);
  if (!surLeTicket) {
    await github.labelliser(ticket, [CHEF_TODO]);
    await github.commenter(ticket, corpsDeLaDemande(demande));
  }
  if (!surLaPR) await github.commenter(pr, corpsDeLaDemande({ ...demande, chef: null }));
  return { ticket: !surLeTicket, pr: !surLaPR };
}
