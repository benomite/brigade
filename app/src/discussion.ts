// L'issue d'un ticket et sa discussion, sur sa fiche — quelle que soit sa carte : lue de GitHub
// (card-github.ts) — le corps, puis les commentaires du plus ancien au plus récent, chacun avec son
// auteur et sa date —, le markdown rendu (markdown.ts).
// Et le commentaire que le chef y ajoute : posté sur l'issue du ticket par l'accès GitHub de ce poste, à son nom
// (actions-github.ts, #2061), au clic et seulement au clic. Aucun LLM, aucune reformulation : le texte part tel qu'il
// est écrit. Le geste se compose ici, jamais dans la vue.
// La demande au second, elle, ne quitte pas le poste : `/brigade:ask <ticket> ` est écrit dans son second, sans Entrée.
import type { Project } from "./config.ts";
import type { Block } from "./markdown.ts";

// Un message de l'issue, dit : qui l'a écrit, quand (l'heure de GitHub), et son texte rendu.
// `corps` : c'est le corps de l'issue, le premier message — pas un commentaire ; `source` : son markdown tel qu'écrit,
// d'où la fiche tire son diagramme (vue/card-diagram/, #3773).
export type MessageSays = { auteur: string; at: string; blocs: Block[]; corps?: true; source?: string };
// La discussion lue : le titre et l'état de l'issue, ses messages dans l'ordre, et les adresses
// qu'un clic peut y ouvrir — ou pourquoi on n'en lit rien.
export type Discussion = { titre: string; ouverte: boolean; messages: MessageSays[]; liens: string[] } | { sans: string };
// Ce qu'il est advenu d'un commentaire : posté — `prix` : ce qu'il a coûté, en une ligne —, ou pourquoi il ne l'est pas.
export type Commented = { poste: true; prix: string } | { poste: false; refus: string };

// GitHub refuse un commentaire plus long.
export const LENGTH_MAX = 65_536;

const text = (value: unknown): value is string => typeof value === "string";
const number = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

// Ce qui poste le commentaire sur l'issue du ticket (main.ts, actions-github.ts) : son adresse, ou pourquoi il n'est pas parti.
export type Post = (ticket: number, text: string) => Promise<{ url: string | null } | { raison: string }>;
export const PRICE = "on its issue, under your GitHub account";

// Le commentaire du chef, posté sur l'issue de ce ticket. Rien ne part d'un texte vide, ni d'un projet qui ne s'ouvre pas.
export async function comment(post: Post, project: Project, ticket: unknown, typed: unknown): Promise<Commented> {
  if (!number(ticket)) return { poste: false, refus: "nothing was posted: the sheet names no ticket" };
  if (!text(typed) || typed.trim() === "") return { poste: false, refus: "nothing was posted: the comment is empty — write something to post" };
  if (typed.includes("\0")) return { poste: false, refus: "nothing was posted: the comment carries a NUL character" };
  if (typed.trim().length > LENGTH_MAX) return { poste: false, refus: `nothing was posted: GitHub refuses a comment longer than ${LENGTH_MAX} characters — this one has ${typed.trim().length}` };
  if (project.refus !== undefined) return { poste: false, refus: `nothing was posted: “${project.nom}” does not open — ${project.refus}` };
  // Les retours à la ligne du poste sont ceux de GitHub : `\n`.
  const rendered = await post(ticket, typed.trim().replace(/\r\n?/g, "\n"));
  if ("raison" in rendered) return { poste: false, refus: `nothing was posted: ${rendered.raison.replace(/[.\s]+$/, "").replace(/^The /, "the ")}` };
  return { poste: true, prix: PRICE };
}

// « ask the second » : `/brigade:ask <ticket> ` — une espace au bout — écrit dans le second du projet, sans Entrée :
// le chef tape sa question à la suite, et c'est son Entrée qui la fait partir. Rien ne part sur GitHub ni sur la
// box : la commande ne tient qu'au numéro, quelle que soit la station du projet. `inscrire` écrit dans le second de ce
// projet (main.ts, `terminaux.inscrire`). Rien n'est écrit sans ticket, ni dans un projet qui ne s'ouvre pas.
export function askAtSecond<Written>(register: (command: string) => Written, project: Project, ticket: unknown): Written | { refus: string } {
  if (!number(ticket)) return { refus: "nothing was written: the sheet names no ticket" };
  if (project.refus !== undefined) return { refus: `nothing was written: “${project.nom}” does not open — ${project.refus}` };
  return register(`/brigade:ask ${ticket} `);
}

// Ce que la note du second dit quand la demande y est écrite. L'avertissement ne vient que si le second était devant
// un dialogue (une permission, un choix) : ces caractères y sont des touches.
export function noteOfTheQuestion(inFrontOneDialog = false): string {
  return inFrontOneDialog
    ? "`/brigade:ask` written into the second, which is waiting for an answer to a dialogue: these characters are keystrokes there — look at the second before pressing Enter"
    : "`/brigade:ask` written into the second, without Enter — type your question after it, then press Enter";
}
