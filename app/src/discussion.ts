// L'issue d'un ticket et sa discussion, sur sa fiche — quelle que soit sa carte : lue de GitHub
// (fiche-github.ts) — le corps, puis les commentaires du plus ancien au plus récent, chacun avec son
// auteur et sa date —, le markdown rendu (markdown.ts).
// Et le commentaire que le chef y ajoute : posté sur l'issue du ticket par l'accès GitHub de ce poste, à son nom
// (gestes-github.ts, #2061), au clic et seulement au clic. Aucun LLM, aucune reformulation : le texte part tel qu'il
// est écrit. Le geste se compose ici, jamais dans la vue.
// La demande au second, elle, ne quitte pas le poste : `/brigade:ask <ticket> ` est écrit dans son second, sans Entrée.
import type { Projet } from "./config.ts";
import type { Bloc } from "./markdown.ts";

// Un message de l'issue, dit : qui l'a écrit, quand (l'heure de GitHub), et son texte rendu.
// `corps` : c'est le corps de l'issue, le premier message — pas un commentaire.
export type MessageDit = { auteur: string; at: string; blocs: Bloc[]; corps?: true };
// La discussion lue : le titre et l'état de l'issue, ses messages dans l'ordre, et les adresses
// qu'un clic peut y ouvrir — ou pourquoi on n'en lit rien.
export type Discussion = { titre: string; ouverte: boolean; messages: MessageDit[]; liens: string[] } | { sans: string };
// Ce qu'il est advenu d'un commentaire : posté — `prix` : ce qu'il a coûté, en une ligne —, ou pourquoi il ne l'est pas.
export type Commente = { poste: true; prix: string } | { poste: false; refus: string };

// GitHub refuse un commentaire plus long.
export const LONGUEUR_MAX = 65_536;

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const numero = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

// Ce qui poste le commentaire sur l'issue du ticket (main.ts, gestes-github.ts) : son adresse, ou pourquoi il n'est pas parti.
export type Poster = (ticket: number, texte: string) => Promise<{ url: string | null } | { raison: string }>;
export const PRIX = "on its issue, under your GitHub account";

// Le commentaire du chef, posté sur l'issue de ce ticket. Rien ne part d'un texte vide, ni d'un projet qui ne s'ouvre pas.
export async function commenter(poster: Poster, projet: Projet, ticket: unknown, saisi: unknown): Promise<Commente> {
  if (!numero(ticket)) return { poste: false, refus: "nothing was posted: the sheet names no ticket" };
  if (!texte(saisi) || saisi.trim() === "") return { poste: false, refus: "nothing was posted: the comment is empty — write something to post" };
  if (saisi.includes("\0")) return { poste: false, refus: "nothing was posted: the comment carries a NUL character" };
  if (saisi.trim().length > LONGUEUR_MAX) return { poste: false, refus: `nothing was posted: GitHub refuses a comment longer than ${LONGUEUR_MAX} characters — this one has ${saisi.trim().length}` };
  if (projet.refus !== undefined) return { poste: false, refus: `nothing was posted: “${projet.nom}” does not open — ${projet.refus}` };
  // Les retours à la ligne du poste sont ceux de GitHub : `\n`.
  const rendu = await poster(ticket, saisi.trim().replace(/\r\n?/g, "\n"));
  if ("raison" in rendu) return { poste: false, refus: `nothing was posted: ${rendu.raison.replace(/[.\s]+$/, "").replace(/^The /, "the ")}` };
  return { poste: true, prix: PRIX };
}

// « ask the second » : `/brigade:ask <ticket> ` — une espace au bout — écrit dans le second du projet, sans Entrée :
// le chef tape sa question à la suite, et c'est son Entrée qui la fait partir. Rien ne part sur GitHub ni sur la
// box : la commande ne tient qu'au numéro, quelle que soit la station du projet. `inscrire` écrit dans le second de ce
// projet (main.ts, `terminaux.inscrire`). Rien n'est écrit sans ticket, ni dans un projet qui ne s'ouvre pas.
export function demanderAuSecond<Ecrit>(inscrire: (commande: string) => Ecrit, projet: Projet, ticket: unknown): Ecrit | { refus: string } {
  if (!numero(ticket)) return { refus: "nothing was written: the sheet names no ticket" };
  if (projet.refus !== undefined) return { refus: `nothing was written: “${projet.nom}” does not open — ${projet.refus}` };
  return inscrire(`/brigade:ask ${ticket} `);
}

// Ce que la note du second dit quand la demande y est écrite. L'avertissement ne vient que si le second était devant
// un dialogue (une permission, un choix) : ces caractères y sont des touches.
export function noteDeLaQuestion(devantUnDialogue = false): string {
  return devantUnDialogue
    ? "`/brigade:ask` written into the second, which is waiting for an answer to a dialogue: these characters are keystrokes there — look at the second before pressing Enter"
    : "`/brigade:ask` written into the second, without Enter — type your question after it, then press Enter";
}
