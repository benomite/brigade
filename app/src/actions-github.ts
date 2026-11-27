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
import { LABELS } from "../../runtime/src/kitchen/decide.ts";
import { refusalOf } from "./board/client.ts";
import type { BoardRead } from "./board/read.ts";
import type { ClientOfThePriority } from "./priority.ts";

// Ce que la fiche reçoit (vue.js, `jouerGesteDeFiche`) : le geste fait, son adresse au survol — ou pourquoi rien n'est
// parti, son détail au survol.
export type Written = { fait: string; detail: string } | { refus: string; detail: string };

// Les gestes de la fiche qui s'écrivent sur GitHub, et le label que chacun retire de l'issue.
// `cuisine` : le ticket parqué reprend où il était (#4129, d'abord `waiting`).
export const LABELS_OF_ACTIONS = { retirer: LABELS.ready, cuisine: LABELS.parked } as const;
// Les labels d'attente d'avant parked que la cuisine lit encore comme parqués (runtime/src/kitchen/decide.ts).
const LABELS_BEFORE_PARKED: readonly string[] = ["waiting", "blocked-on-human"];
export type ActionOnGithub = keyof typeof LABELS_OF_ACTIONS;
export const onGithub = (id: unknown): id is ActionOnGithub => typeof id === "string" && Object.hasOwn(LABELS_OF_ACTIONS, id);

// Ce que la vue demande et qui n'a aucun fait sur GitHub qu'une station lise.
export const WITHOUT_DONE = {
  carte: "nothing was posted: a card of TODO is answered on its issue on GitHub — the station reads the issue, not the app",
} as const;

const NOT_READ = "nothing was written: the rail of this project has not been read yet — read it again";

// Les tickets que la dernière lecture porte : ceux de son rail (`faits.rail`) et de TODO (`faits.attend`, et `faits.attendAutres` : l'assignation ne retient personne, #3071).
export function ticketsRead(readOne: Pick<BoardRead, "faits">): Set<number> {
  const tickets = (list: unknown): number[] =>
    Array.isArray(list) ? list.flatMap((entry: unknown) => (typeof entry === "object" && entry !== null && typeof (entry as { ticket?: unknown }).ticket === "number" ? [(entry as { ticket: number }).ticket] : [])) : [];
  return new Set([...tickets(readOne.faits.rail), ...tickets(readOne.faits.attend), ...tickets(readOne.faits.attendAutres)]);
}

const number = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Retire de l'issue du ticket le label du geste : `fire` pour le retirer du rail, `parked` pour le déparquer
// (`deparquer`). Rien ne part pour un ticket que la dernière lecture du rail ne porte pas.
export async function removeTheLabel(readOne: BoardRead | undefined, id: ActionOnGithub, ticket: unknown, client: ClientOfThePriority): Promise<Written> {
  if (!number(ticket)) return { refus: "nothing was written: the action names no ticket", detail: "" };
  if (readOne === undefined) return { refus: NOT_READ, detail: "" };
  if (!ticketsRead(readOne).has(ticket)) return { refus: `nothing was written: #${ticket} is not on the latest rail read — read it again`, detail: "" };
  return REMOVALS[id](readOne.depot, ticket, client);
}

// Déparquer un ticket (#4262) : le label `parked` retiré de son issue — et chaque label d'attente d'avant parked
// (`LABELS_BEFORE_PARKED`) : un ticket que l'un d'eux parque reprend aussi —, sur tout dépôt, sans box. C'est
// le seul chemin qui le sort de son attente, que l'app le joue (« resume », « it arrived, back to the kitchen », « back to
// the kitchen » de la fiche) ou le second (second/parking.ts) : il reprend exactement où il était.
export const unpark = (repository: string, ticket: number, client: ClientOfThePriority): Promise<Written> => removeOfTheIssue(repository, ticket, "cuisine", client);

// Ce que chaque geste joue : « remove from the rail » retire `fire` ; rendre le ticket à la cuisine, c'est le déparquer.
const REMOVALS: Record<ActionOnGithub, (repository: string, ticket: number, client: ClientOfThePriority) => Promise<Written>> = {
  retirer: (repository, ticket, client) => removeOfTheIssue(repository, ticket, "retirer", client),
  cuisine: (repository, ticket, client) => unpark(repository, ticket, client),
};

// Le label du geste retiré de l'issue — et, pour déparquer, les labels d'attente d'avant parked. Une issue qui ne le
// porte déjà plus : c'est fait.
async function removeOfTheIssue(repository: string, ticket: number, id: ActionOnGithub, client: ClientOfThePriority): Promise<Written> {
  const label = LABELS_OF_ACTIONS[id];
  const issue = `https://github.com/${repository}/issues/${ticket}`;
  for (const removed of id === "cuisine" ? [label, ...LABELS_BEFORE_PARKED] : [label]) {
    try {
      const answer = await client.ecrire("DELETE", `/repos/${repository}/issues/${ticket}/labels/${encodeURIComponent(removed)}`);
      if (answer.status !== 200 && answer.status !== 404) throw refusalOf(`the removal of \`${removed}\``, answer);
    } catch (error) {
      // Un label d'avant que GitHub ne retire pas : `parked` l'est déjà, le ticket reste parqué par celui-là.
      const already = removed === label ? "nothing was changed:" : `\`${label}\` is removed, but`;
      return { refus: `${already} GitHub did not remove \`${removed}\` from #${ticket}`, detail: reason(error) };
    }
  }
  const done = id === "retirer" ? `taken off the rail on GitHub: #${ticket} no longer carries \`fire\` — no station takes it` : `back to the kitchen on GitHub: #${ticket} no longer carries \`${label}\` — it resumes exactly where it was`;
  return { fait: done, detail: issue };
}

// Poste le commentaire du chef sur l'issue du ticket, tel qu'il est écrit. Rend son adresse, ou pourquoi il n'est pas parti.
export async function commentTheIssue(repository: string, ticket: number, text: string, client: ClientOfThePriority): Promise<{ url: string | null } | { raison: string }> {
  try {
    const answer = await client.ecrire("POST", `/repos/${repository}/issues/${ticket}/comments`, { body: text });
    if (answer.status !== 201) throw refusalOf("the comment", answer);
    const { html_url: url } = (typeof answer.data === "object" && answer.data !== null ? answer.data : {}) as Record<string, unknown>;
    return { url: typeof url === "string" ? url : null };
  } catch (error) {
    return { raison: `The comment could not be posted on #${ticket} of ${repository}: ${reason(error).replace(/[.\s]+$/, "")}.` };
  }
}
