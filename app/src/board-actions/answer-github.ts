// La réponse du chef à une carte du chef lue de GitHub (#2434) : un clic sur un choix, ou son
// texte, joué par l'app elle-même sur GitHub, avec le jeton du `gh` de ce poste — celui du chef. Ni box, ni tableau de la
// cuisine, ni station : GitHub est le seul état.
//
// La carte est celle que la dernière lecture porte (board/todo-github.ts, `formeDuChef`) : sa question, ses choix
// `- [<geste>] <libellé>`. La réponse se contrôle comme celle de toute carte de TODO (card-todo.ts, `reponseLue`), puis :
//   1. un commentaire est posté sur l'issue : `<!-- brigade:reponse gesture=<geste> -->`, puis le libellé du choix, ou le
//      texte du chef — il reste dans l'issue, c'est là que le cook le lit ;
//   2. le geste est joué :
//      - `resume` (un choix, ou tout texte libre) : `served-elsewhere`, `chef-todo`, `parked` et les labels d'attente d'avant
//        parked (`LABELS_D_AVANT_PARKED` de runtime/src/github-etat/etats.ts) retirés — le ticket reprend où il était (#4129) ;
//      - `merge` : la PR que la carte nomme est mergée — celle que le libellé du choix nomme (`#N`), sinon la PR ouverte
//        du ticket — celle d'un libellé qui la dit par son ticket (`PR of #T`, ticket 3716) ; aucune, rien ne part.
//        Les labels d'attente d'avant parked sont retirés aussi ;
//      - `drop` : `fire` retiré — le ticket sort du rail, son issue reste ouverte ;
//      - `close` : l'issue est fermée ;
//      - `rail` : le label `prio:N` que le libellé du choix nomme (sinon `fire`) est posé — l'issue d'un inconnu entre sur le rail.
//      - `wait` : l'issue est parquée pour un tiers (#3434, #4129) — le commentaire de parking, qui attend ce que le libellé
//        `Wait for <qui>` nomme, la question de la carte pour ce qu'il attend, la date à sept jours, puis le label
//        `parked` (vue/wait/wait-github.ts, `parquer`) ; les labels d'avant parked qui la parquaient pour le
//        chef sont retirés : la question attend un tiers, plus le chef.
//      Chaque geste retire aussi `chef-todo`, et `parked` sauf `wait` : répondue, la question n'attend plus le chef, et le
//      ticket parqué pour lui reprend où il était (#4129).
// La carte d'un ticket que la nouvelle cuisine parque pour le chef (`parked:chef`, #4474, board/parked-chef-github.ts) n'a
// que sa réponse libre, Answer : le commentaire posté, puis `parked:chef` retiré, et rien d'autre — il retourne sur le rail.
// La carte quitte TODO à la lecture suivante : ses labels ont changé, et une question que suit une réponse n'en pose plus
// (board/set-aside-github.ts).
import { cardReadOfChef, answerRead, type Rendered } from "../card-todo.ts";
import type { MethodOfWriting } from "../priority.ts";
import type { CallGitHub, AnswerGitHub } from "../board/client.ts";
import { LABELS_D_AVANT_PARKED, LABELS_D_AVANT_PARKED_POUR_LE_CHEF } from "../../../runtime/src/github-etat/etats.ts";
import { SERVED_ELSEWHERE } from "../board/set-aside-github.ts";
import { LABEL_PARKED_CHEF, KIND_PARKED_CHEF } from "../board/parked-chef-github.ts";
import { ticketOfThePR } from "../board/rail-github.ts";
import { LABEL_OF_CHEF, type CardOfChef, type ActionOfChef } from "../board/todo-github.ts";
import { refusalOf } from "../board/client.ts";
import { PR_OF_TICKET } from "../vue/pr-of-ticket.js";
import { LABELS_OF_ACTIONS } from "../actions-github.ts";
import { park } from "../vue/wait/wait-github.ts";
import { relaunchProposed, inputRead } from "../vue/wait/input.ts";

// Le client : les lectures par le `GET` du tableau (client.ts), les écritures avec le même jeton — celui des labels de
// priorité (priority.ts, `clientDeLaPriorite`).
export type ClientOfTheAnswer = { lire: CallGitHub; ecrire: (method: MethodOfWriting, path: string, body?: unknown) => Promise<AnswerGitHub> };

const LABEL_FIRE = "fire";
// Le ticket d'une carte attend le chef : il est parqué pour lui (`chef-todo`, #4129). Répondu, il ne l'attend plus, ni
// personne : sa carte tombe, et `parked` s'il l'avait parquée pour un autre — sauf `wait`, qui la parque pour un autre.
const PARKED = LABELS_OF_ACTIONS.cuisine;
// Ce que chaque geste retire de l'issue, en plus de jouer ce qu'il joue.
const REMOVED: Readonly<Record<ActionOfChef, readonly string[]>> = {
  // Le ticket reprend où il était : la mise de côté est levée (#3369), et ce qui le parquait — sa carte, `parked`, ou un label
  // d'attente d'avant parked (#4129).
  resume: [SERVED_ELSEWHERE, LABEL_OF_CHEF, PARKED, ...LABELS_D_AVANT_PARKED],
  // Mergée, la livraison n'attend plus personne.
  merge: [LABEL_OF_CHEF, PARKED, ...LABELS_D_AVANT_PARKED],
  drop: [LABEL_FIRE, LABEL_OF_CHEF, PARKED],
  close: [LABEL_OF_CHEF, PARKED],
  rail: [LABEL_OF_CHEF, PARKED],
  // Parquée pour un tiers, la question du manager l'attend, lui : elle n'attend plus le chef (#3434).
  wait: [...LABELS_D_AVANT_PARKED_POUR_LE_CHEF, LABEL_OF_CHEF],
};

// Qui un choix « Wait for <qui> » attend — le libellé entier, s'il n'a pas cette forme.
const expected = (wording: string) => /^wait for\s+(.+)$/i.exec(wording.trim())?.[1]?.trim() ?? wording.trim();

// Le commentaire de la réponse : sa marque, puis le libellé du choix, ou le texte du chef.
export const commentOfAnswer = (action: ActionOfChef, saidOne: string): string => `<!-- brigade:reponse gesture=${action} -->\n${saidOne}`;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const object = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

// La PR ouverte que la carte nomme : le `#N` du libellé du choix, s'il nomme une PR ouverte ; sinon celle dont la branche
// ou le corps nomme le ticket (rail-github.ts, `ticketOfThePR`). Rien : nulle.
async function prNamed(repository: string, ticket: number, wording: string, client: ClientOfTheAnswer): Promise<number | null> {
  // « Merge the PR of #T » nomme la PR par son ticket (ticket 3716) : c'est la PR ouverte du ticket, pas la PR #T.
  const named = /PR of #\d+/.test(wording) ? undefined : /#(\d+)\b/.exec(wording)?.[1];
  if (named !== undefined) {
    const readEntry = await client.lire(`/repos/${repository}/pulls/${named}`);
    if (readEntry.status === 200 && object(readEntry.data).state === "open") return Number(named);
  }
  const openEntries = await client.lire(`/repos/${repository}/pulls?state=open&per_page=100`);
  if (openEntries.status !== 200) throw refusalOf("the reading of the open PRs", openEntries);
  const list = Array.isArray(openEntries.data) ? (openEntries.data as unknown[]).map(object) : [];
  const itsOwnOne = list.find((pr) => typeof pr.number === "number" && ticketOfThePR(String(object(pr.head).ref ?? ""), typeof pr.body === "string" ? pr.body : "") === ticket);
  return itsOwnOne === undefined ? null : (itsOwnOne.number as number);
}

// Le geste joué sur l'issue de `ticket` — ce qu'il dit fait, ou l'erreur de GitHub.
async function play(repository: string, ticket: number, action: ActionOfChef, pr: number | null, wording: string, question: string, now: Date, client: ClientOfTheAnswer, parkedForTheChef = false): Promise<string> {
  const issue = `/repos/${repository}/issues/${ticket}`;
  let done = "";
  if (action === "wait") {
    const readEntry = inputRead({ quoi: question, qui: expected(wording), relance: relaunchProposed(now) }, now);
    if ("refus" in readEntry) throw new Error(readEntry.refus);
    const written = await park(repository, ticket, readEntry, now, client);
    if ("refus" in written) throw new Error(`${written.refus}${written.detail === "" ? "" : ` — ${written.detail}`}`);
    done = written.fait;
  }
  if (action === "merge" && pr !== null) {
    const mergee = await client.ecrire("PUT", `/repos/${repository}/pulls/${pr}/merge`, { merge_method: "merge" });
    if (mergee.status !== 200) throw refusalOf(`the merge of the ${PR_OF_TICKET(ticket)}`, mergee);
    done = `the ${PR_OF_TICKET(ticket)} merged`;
  }
  if (action === "close") {
    const closedOne = await client.ecrire("PATCH", issue, { state: "closed", state_reason: "not_planned" });
    if (closedOne.status !== 200) throw refusalOf(`the closing of #${ticket}`, closedOne);
    done = `#${ticket} closed`;
  }
  if (action === "rail") {
    // L'issue d'un inconnu : le `prio:` que le choix nomme, sinon `fire`, comme « on the rail » du runtime.
    const label = /\bprio:([1-9])\b/.exec(wording)?.[0] ?? LABEL_FIRE;
    const setOne = await client.ecrire("POST", `${issue}/labels`, { labels: [label] });
    if (setOne.status !== 200) throw refusalOf(`the \`${label}\` label`, setOne);
    done = `\`${label}\` put on #${ticket}`;
  }
  const removed: string[] = [];
  for (const label of parkedForTheChef ? [LABEL_PARKED_CHEF] : REMOVED[action]) {
    const withdrawn = await client.ecrire("DELETE", `${issue}/labels/${encodeURIComponent(label)}`);
    // Une issue qui ne le porte pas : rien à retirer.
    if (withdrawn.status === 200) removed.push(`\`${label}\``);
    else if (withdrawn.status !== 404) throw refusalOf(`the removal of \`${label}\``, withdrawn);
  }
  const saidOnes = [done, removed.length === 0 ? "" : `${removed.join(" and ")} removed`].filter((said) => said !== "");
  return saidOnes.length === 0 ? "nothing else to change on the issue" : saidOnes.join(", ");
}

// La réponse du chef à la carte du chef de `ticket` — `chef`, celle que la dernière lecture porte —, jouée sur GitHub.
// Rien ne part pour une carte inconnue, changée, une réponse vide, ni un merge sans PR à merger. Le commentaire posté, un
// geste que GitHub refuse se dit : la réponse est écrite, le geste est à faire sur GitHub.
export async function answerOnGithub({ depot: repository, ticket, chef, reponse: answer, client, maintenant: now = new Date() }: { depot: string; ticket: unknown; chef: CardOfChef | undefined; reponse: unknown; client: ClientOfTheAnswer; maintenant?: Date }): Promise<Rendered> {
  const known = chef === undefined ? undefined : cardReadOfChef(chef);
  const readEntry = answerRead(known, ticket, answer);
  if ("refus" in readEntry) return readEntry;
  const chosen = "choix" in readEntry ? known?.choix[readEntry.choix - 1] : undefined;
  const action = (chosen?.suite ?? "resume") as ActionOfChef;
  let pr: number | null = null;
  if (action === "merge") {
    try {
      pr = await prNamed(repository, readEntry.ticket, chosen?.texte ?? "", client);
    } catch (error) {
      return { refus: `nothing was sent: the PR to merge for #${readEntry.ticket} was not read on GitHub`, detail: message(error) };
    }
    if (pr === null) return { refus: `nothing was sent: no open PR names #${readEntry.ticket} — the card has nothing to merge`, detail: "" };
  }
  let comment: number;
  try {
    const setOne = await client.ecrire("POST", `/repos/${repository}/issues/${readEntry.ticket}/comments`, { body: commentOfAnswer(action, chosen?.texte ?? ("texte" in readEntry ? readEntry.texte : "")) });
    if (setOne.status !== 201) throw refusalOf("the comment", setOne);
    const id = object(setOne.data).id;
    comment = typeof id === "number" ? id : 0;
  } catch (error) {
    return { refus: `nothing was sent: your answer was not posted on #${readEntry.ticket}`, detail: message(error) };
  }
  try {
    const done = await play(repository, readEntry.ticket, action, pr, chosen?.texte ?? "", known?.question ?? "", now, client, chef?.sorte === KIND_PARKED_CHEF);
    return { repondue: true, dit: `answer posted on #${readEntry.ticket} (${action}): ${done}`, commentaire: comment };
  } catch (error) {
    return { refus: `your answer is posted on #${readEntry.ticket}, but its gesture (${action}) was not played — play it on GitHub`, detail: message(error) };
  }
}
