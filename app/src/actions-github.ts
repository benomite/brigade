// Les gestes du chef depuis la vue du rail, écrits sur GitHub même (#2061) : aucune box ne lit plus de tableau de la
// cuisine, et les stations ne lisent que les issues, leurs labels et leurs commentaires. Ce qui a un fait sur GitHub s'y
// écrit, par l'accès GitHub de l'app — le jeton du `gh` de ce poste, celui du chef :
//   - « remove from the rail » (`retirer`, sur la fiche) : le label `fire` retiré de l'issue — plus aucune station ne
//     prend le ticket ;
//   - « back to the kitchen » (`cuisine`, sur la fiche) et « it arrived » (sur une carte de WAITING) : le label `parked`
//     retiré, et tout label d'attente d'avant parked — le ticket reprend où il était (#4129) ;
//   - le commentaire du chef, sur la fiche : posté sur l'issue du ticket, à son nom — le cook qui le prend le lit.
// Le reste n'a aucun fait sur GitHub qu'une station lise : rien ne part, et la phrase dit où le faire (`SANS_FAIT`).
//
// Rien ne part pour un ticket que la dernière lecture du rail ne porte pas — ni sur son rail, ni dans TODO —, ni sans
// lecture : chaque fois une phrase, et rien n'est écrit.
import { LABEL_PARKED } from "../../runtime/src/attente-github/marque.ts";
import { LABELS_D_AVANT_PARKED } from "../../runtime/src/github-etat/etats.ts";
import { refusalDe } from "./tableau/client.ts";
import type { TableauLu } from "./tableau/read.ts";
import type { ClientDeLaPriority } from "./priority.ts";

// Ce que la fiche reçoit (vue.js, `jouerGesteDeFiche`) : le geste fait, son adresse au survol — ou pourquoi rien n'est
// parti, son détail au survol.
export type Ecrit = { fait: string; detail: string } | { refus: string; detail: string };

// Les gestes de la fiche qui s'écrivent sur GitHub, et le label que chacun retire de l'issue.
// `cuisine` : le ticket parqué reprend où il était (#4129, d'abord `waiting`).
export const LABELS_DES_ACTIONS = { retirer: "fire", cuisine: LABEL_PARKED } as const;
export type ActionSurGithub = keyof typeof LABELS_DES_ACTIONS;
export const surGithub = (id: unknown): id is ActionSurGithub => typeof id === "string" && Object.hasOwn(LABELS_DES_ACTIONS, id);

// Ce que la vue demande et qui n'a aucun fait sur GitHub qu'une station lise.
export const SANS_FAIT = {
  carte: "nothing was posted: a card of TODO is answered on its issue on GitHub — the station reads the issue, not the app",
} as const;

const PAS_LU = "nothing was written: the rail of this project has not been read yet — read it again";

// Les tickets que la dernière lecture porte : ceux de son rail (`faits.rail`) et de TODO (`faits.attend`, et `faits.attendAutres` : l'assignation ne retient personne, #3071).
export function ticketsLus(lu: Pick<TableauLu, "faits">): Set<number> {
  const tickets = (liste: unknown): number[] =>
    Array.isArray(liste) ? liste.flatMap((entree: unknown) => (typeof entree === "object" && entree !== null && typeof (entree as { ticket?: unknown }).ticket === "number" ? [(entree as { ticket: number }).ticket] : [])) : [];
  return new Set([...tickets(lu.faits.rail), ...tickets(lu.faits.attend), ...tickets(lu.faits.attendAutres)]);
}

const numero = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;
const raison = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Retire de l'issue du ticket le label du geste : `fire` pour le retirer du rail, `parked` pour le déparquer
// (`deparquer`). Rien ne part pour un ticket que la dernière lecture du rail ne porte pas.
export async function retirerLeLabel(lu: TableauLu | undefined, id: ActionSurGithub, ticket: unknown, client: ClientDeLaPriority): Promise<Ecrit> {
  if (!numero(ticket)) return { refus: "nothing was written: the action names no ticket", detail: "" };
  if (lu === undefined) return { refus: PAS_LU, detail: "" };
  if (!ticketsLus(lu).has(ticket)) return { refus: `nothing was written: #${ticket} is not on the latest rail read — read it again`, detail: "" };
  return RETRAITS[id](lu.depot, ticket, client);
}

// Déparquer un ticket (#4262) : le label `parked` retiré de son issue — et chaque label d'attente d'avant parked
// (runtime/src/github-etat/etats.ts) : un ticket que l'un d'eux parque reprend aussi —, sur tout dépôt, sans box. C'est
// le seul chemin qui le sort de son attente, que l'app le joue (« resume », « it arrived, back to the kitchen », « back to
// the kitchen » de la fiche) ou le second (second/parking.ts) : il reprend exactement où il était.
export const deparquer = (repository: string, ticket: number, client: ClientDeLaPriority): Promise<Ecrit> => retirerDeLIssue(repository, ticket, "cuisine", client);

// Ce que chaque geste joue : « remove from the rail » retire `fire` ; rendre le ticket à la cuisine, c'est le déparquer.
const RETRAITS: Record<ActionSurGithub, (repository: string, ticket: number, client: ClientDeLaPriority) => Promise<Ecrit>> = {
  retirer: (repository, ticket, client) => retirerDeLIssue(repository, ticket, "retirer", client),
  cuisine: (repository, ticket, client) => deparquer(repository, ticket, client),
};

// Le label du geste retiré de l'issue — et, pour déparquer, les labels d'attente d'avant parked. Une issue qui ne le
// porte déjà plus : c'est fait.
async function retirerDeLIssue(repository: string, ticket: number, id: ActionSurGithub, client: ClientDeLaPriority): Promise<Ecrit> {
  const label = LABELS_DES_ACTIONS[id];
  const issue = `https://github.com/${repository}/issues/${ticket}`;
  for (const retire of id === "cuisine" ? [label, ...LABELS_D_AVANT_PARKED] : [label]) {
    try {
      const answer = await client.ecrire("DELETE", `/repos/${repository}/issues/${ticket}/labels/${encodeURIComponent(retire)}`);
      if (answer.status !== 200 && answer.status !== 404) throw refusalDe(`the removal of \`${retire}\``, answer);
    } catch (error) {
      // Un label d'avant que GitHub ne retire pas : `parked` l'est déjà, le ticket reste parqué par celui-là.
      const deja = retire === label ? "nothing was changed:" : `\`${label}\` is removed, but`;
      return { refus: `${deja} GitHub did not remove \`${retire}\` from #${ticket}`, detail: raison(error) };
    }
  }
  const fait = id === "retirer" ? `taken off the rail on GitHub: #${ticket} no longer carries \`fire\` — no station takes it` : `back to the kitchen on GitHub: #${ticket} no longer carries \`${label}\` — it resumes exactly where it was`;
  return { fait, detail: issue };
}

// Poste le commentaire du chef sur l'issue du ticket, tel qu'il est écrit. Rend son adresse, ou pourquoi il n'est pas parti.
export async function commenterLIssue(repository: string, ticket: number, texte: string, client: ClientDeLaPriority): Promise<{ url: string | null } | { raison: string }> {
  try {
    const answer = await client.ecrire("POST", `/repos/${repository}/issues/${ticket}/comments`, { body: texte });
    if (answer.status !== 201) throw refusalDe("the comment", answer);
    const { html_url: url } = (typeof answer.data === "object" && answer.data !== null ? answer.data : {}) as Record<string, unknown>;
    return { url: typeof url === "string" ? url : null };
  } catch (error) {
    return { raison: `The comment could not be posted on #${ticket} of ${repository}: ${raison(error).replace(/[.\s]+$/, "")}.` };
  }
}
