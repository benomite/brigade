// L'issue GitHub d'une carte, depuis la fiche de l'app : la lire — son corps et
// sa discussion —, et y poster un commentaire du chef. Aucun LLM : le texte part
// tel que le chef l'a écrit, par le même GitHub que le reste du runtime. Le
// point d'entrée est `pass -- <ticket> issue | comment <texte>` (montrer-pass.ts),
// sous le `gh` du compte du service.
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

const NOTHING_POSTED = "none: nothing was posted";

const refuse = (reason: string): Resultat => ({ done: false, reason, price: NOTHING_POSTED });

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
    price: `a comment is posted on issue #${ticket}, under the box's own gh account, not a role's App: it is public on GitHub, and whoever reads the issue next — the manager, the next cook — reads it. It is not withdrawn from here: edit or delete it on GitHub. No model is called, nothing is spent`,
  };
}

// Ce que la fiche écrit dans le second : la demande, en prose, que l'app inscrit
// sans Entrée (#452 le fait pour `T'attend`). Le runtime ne tient aucun canal vers
// le second — c'est une session `claude` dans un pty de l'app — : il compose la
// phrase, d'après l'issue lue à l'instant, et la rend ; `done: true` dit que la
// demande est prête à être écrite, pas qu'elle y est. Le second est le principal,
// aucun LLM propre à la fiche. Un texte vide laisse la demande nommer l'issue seule.
export type Demande = { done: true; request: string; price: string } | { done: false; reason: string; price: string };

const RIEN_ECRIT = "none: nothing was written to the second";

// Un retour à la ligne dans la demande l'enverrait : le contexte que le chef a saisi
// sur plusieurs lignes devient une seule, ses blancs réduits à un.
const surUneLigne = (texte: string) => texte.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\s]+/g, " ").trim();

export async function demanderAuSecond(github: GitHub, ticket: number, contexte: unknown): Promise<Demande> {
  if (contexte !== undefined && contexte !== null && typeof contexte !== "string") {
    return { done: false, reason: "the context is not a text", price: RIEN_ECRIT };
  }
  const { issue, reason } = await sansIssue(github, ticket);
  if (!issue) return { done: false, reason, price: RIEN_ECRIT };
  const saisi = surUneLigne(contexte ?? "");
  const titre = surUneLigne(issue.title);
  const request =
    `Je te demande à propos de l'issue #${ticket}${titre === "" ? "" : ` (« ${titre} »)`}. ` +
    (saisi === "" ? "Je n'ai pas de contexte à ajouter. " : `Voici le contexte que je viens d'écrire : « ${saisi} ». `) +
    `Lis l'issue #${ticket} et sa discussion, puis dis-moi ce que tu en comprends et ce que tu proposes ; n'agis pas avant mon accord.`;
  return {
    done: true,
    request,
    price: "none: nothing is posted on GitHub and no model is called here — the app writes the request into the second, without Enter, and it is the second that answers",
  };
}
