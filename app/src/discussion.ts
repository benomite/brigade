// L'issue d'un ticket et sa discussion, lues de GitHub (card-github.ts) — le corps, puis les commentaires du plus ancien au
// plus récent, chacun avec son auteur et sa date —, le markdown rendu (markdown.ts) : de quoi passer une carte au second
// (handover-second.ts).
// La demande au second, elle, ne quitte pas le poste : `/brigade:ask <ticket> ` est écrit dans son second, sans Entrée.
import type { Project } from "./config.ts";
import type { Block } from "./markdown.ts";

// Un message de l'issue, dit : qui l'a écrit, quand (l'heure de GitHub), et son texte rendu.
// `corps` : c'est le corps de l'issue, le premier message — pas un commentaire.
export type MessageSays = { auteur: string; at: string; blocs: Block[]; corps?: true };
// La discussion lue : le titre et l'état de l'issue, ses messages dans l'ordre — ou pourquoi on n'en lit rien.
export type Discussion = { titre: string; ouverte: boolean; messages: MessageSays[] } | { sans: string };

// GitHub refuse un commentaire plus long.
export const LENGTH_MAX = 65_536;

const number = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;

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
