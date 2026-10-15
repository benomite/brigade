// L'issue GitHub d'une carte, depuis la fiche de l'app : la lire — son corps et
// sa discussion —, et y poster un commentaire du chef. Aucun LLM : le texte part
// tel que le chef l'a écrit, par le même GitHub que le reste du runtime.
//
// La lecture ne demande pas que le ticket soit sur le rail : toute carte porte
// un numéro d'issue, qu'elle soit en amont, sur le rail ou servie. Une carte
// sans issue — disparue de GitHub, ou une PR — est refusée en le disant, et
// rien n'est posté. Rien ne part sans l'appel d'écriture.
import type { Resultat } from "./geste-ticket.ts";
import type { GitHub } from "./github.ts";

// Un message de l'issue : son corps, ou l'un de ses commentaires. `author` : le
// compte GitHub, vide si GitHub ne le dit plus (compte supprimé). `at` : quand
// il a été posté, tel que GitHub le date.
export type Message = { author: string; at: string; body: string };

// `comments` : du plus ancien au plus récent.
export type IssueDuTicket = {
  ticket: number;
  title: string;
  url: string;
  state: "open" | "closed";
  body: Message;
  comments: Message[];
};

export type Lecture = { found: true; issue: IssueDuTicket } | { found: false; reason: string };

const RIEN_POSTE = "none: nothing was posted";

const refuse = (reason: string): Resultat => ({ done: false, reason, price: RIEN_POSTE });

const numeroValide = (ticket: number) => Number.isSafeInteger(ticket) && ticket > 0;

// Ce qui manque à une carte pour avoir une issue, ou null si elle en a une.
async function sansIssue(github: GitHub, ticket: number) {
  if (!numeroValide(ticket)) return { issue: null, reason: `${JSON.stringify(ticket) ?? String(ticket)} is not a ticket number` };
  const issue = await github.issue(ticket);
  if (!issue) return { issue: null, reason: `#${ticket} has no GitHub issue: it does not exist, or is gone` };
  if (issue.pr) return { issue: null, reason: `#${ticket} is a pull request, not an issue` };
  return { issue, reason: null };
}

// L'issue d'une carte : son corps, puis ses commentaires dans l'ordre où ils
// ont été postés, chacun avec son auteur et sa date. Une panne de GitHub lève :
// une issue illisible n'est pas une issue absente.
export async function lireIssue(github: GitHub, ticket: number): Promise<Lecture> {
  const { issue, reason } = await sansIssue(github, ticket);
  if (!issue) return { found: false, reason };
  const commentaires = await github.commentaires(ticket);
  return {
    found: true,
    issue: {
      ticket,
      title: issue.title,
      url: issue.url,
      state: issue.state,
      body: { author: issue.author ?? "", at: issue.createdAt, body: issue.body ?? "" },
      comments: commentaires.map(({ author, createdAt, body }) => ({ author, at: createdAt, body })),
    },
  };
}

// Poste `texte` en commentaire sur l'issue d'une carte. Un texte vide — ou fait
// de blancs —, ou une carte sans issue, est refusé, et rien n'est posté. Le
// texte part tel quel, sans les blancs qui l'entourent. Un refus de GitHub lève.
export async function commenterIssue(github: GitHub, ticket: number, texte: unknown): Promise<Resultat> {
  if (typeof texte !== "string" || texte.trim() === "") return refuse("the comment is empty: write something to post");
  const { issue, reason } = await sansIssue(github, ticket);
  if (!issue) return refuse(reason);
  await github.commenter(ticket, texte.trim());
  return {
    done: true,
    price: `a comment is posted on issue #${ticket}, under the runtime's GitHub identity: it is public on GitHub, and whoever reads the issue next — the manager, the next cook — reads it. It is not withdrawn from here: edit or delete it on GitHub. No model is called, nothing is spent`,
  };
}
