// La réponse du chef à une carte du chef lue de GitHub (#2434) : un clic sur un choix, ou son
// texte, joué par l'app elle-même sur GitHub, avec le jeton du `gh` de ce poste — celui du chef. Ni box, ni tableau de la
// cuisine, ni station : GitHub est le seul état.
//
// La carte est celle que la dernière lecture porte (tableau/todo-github.ts, `formeDuChef`) : sa question, ses choix
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
// La carte quitte TODO à la lecture suivante : ses labels ont changé, et une question que suit une réponse n'en pose plus
// (tableau/mise-de-side-github.ts).
import { cardLueDuChef, answerLue, type Rendu } from "../card-todo.ts";
import type { MethodeDEcriture } from "../priority.ts";
import type { CallGitHub, AnswerGitHub } from "../tableau/client.ts";
import { LABELS_D_AVANT_PARKED, LABELS_D_AVANT_PARKED_POUR_LE_CHEF } from "../../../runtime/src/github-etat/etats.ts";
import { SERVED_ELSEWHERE } from "../tableau/mise-de-side-github.ts";
import { ticketDeLaPR } from "../tableau/rail-github.ts";
import { LABEL_DU_CHEF, type CardDuChef, type ActionDuChef } from "../tableau/todo-github.ts";
import { refusalDe } from "../tableau/client.ts";
import { PR_DU_TICKET } from "../vue/pr-du-ticket.js";
import { LABELS_DES_ACTIONS } from "../actions-github.ts";
import { parquer } from "../vue/wait/wait-github.ts";
import { relanceProposee, saisieLue } from "../vue/wait/saisie.ts";

// Le client : les lectures par le `GET` du tableau (client.ts), les écritures avec le même jeton — celui des labels de
// priorité (priority.ts, `clientDeLaPriorite`).
export type ClientDeLaAnswer = { lire: CallGitHub; ecrire: (methode: MethodeDEcriture, chemin: string, corps?: unknown) => Promise<AnswerGitHub> };

const LABEL_FIRE = "fire";
// Le ticket d'une carte attend le chef : il est parqué pour lui (`chef-todo`, #4129). Répondu, il ne l'attend plus, ni
// personne : sa carte tombe, et `parked` s'il l'avait parquée pour un autre — sauf `wait`, qui la parque pour un autre.
const PARKED = LABELS_DES_ACTIONS.cuisine;
// Ce que chaque geste retire de l'issue, en plus de jouer ce qu'il joue.
const RETIRES: Readonly<Record<ActionDuChef, readonly string[]>> = {
  // Le ticket reprend où il était : la mise de côté est levée (#3369), et ce qui le parquait — sa carte, `parked`, ou un label
  // d'attente d'avant parked (#4129).
  resume: [SERVED_ELSEWHERE, LABEL_DU_CHEF, PARKED, ...LABELS_D_AVANT_PARKED],
  // Mergée, la livraison n'attend plus personne.
  merge: [LABEL_DU_CHEF, PARKED, ...LABELS_D_AVANT_PARKED],
  drop: [LABEL_FIRE, LABEL_DU_CHEF, PARKED],
  close: [LABEL_DU_CHEF, PARKED],
  rail: [LABEL_DU_CHEF, PARKED],
  // Parquée pour un tiers, la question du manager l'attend, lui : elle n'attend plus le chef (#3434).
  wait: [...LABELS_D_AVANT_PARKED_POUR_LE_CHEF, LABEL_DU_CHEF],
};

// Qui un choix « Wait for <qui> » attend — le libellé entier, s'il n'a pas cette forme.
const attendu = (libelle: string) => /^wait for\s+(.+)$/i.exec(libelle.trim())?.[1]?.trim() ?? libelle.trim();

// Le commentaire de la réponse : sa marque, puis le libellé du choix, ou le texte du chef.
export const commentDeAnswer = (action: ActionDuChef, dite: string): string => `<!-- brigade:reponse gesture=${action} -->\n${dite}`;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const objet = (valeur: unknown): Record<string, unknown> => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {});

// La PR ouverte que la carte nomme : le `#N` du libellé du choix, s'il nomme une PR ouverte ; sinon celle dont la branche
// ou le corps nomme le ticket (rail-github.ts, `ticketDeLaPR`). Rien : nulle.
async function prNommee(repository: string, ticket: number, libelle: string, client: ClientDeLaAnswer): Promise<number | null> {
  // « Merge the PR of #T » nomme la PR par son ticket (ticket 3716) : c'est la PR ouverte du ticket, pas la PR #T.
  const nommee = /PR of #\d+/.test(libelle) ? undefined : /#(\d+)\b/.exec(libelle)?.[1];
  if (nommee !== undefined) {
    const lue = await client.lire(`/repos/${repository}/pulls/${nommee}`);
    if (lue.status === 200 && objet(lue.data).state === "open") return Number(nommee);
  }
  const ouvertes = await client.lire(`/repos/${repository}/pulls?state=open&per_page=100`);
  if (ouvertes.status !== 200) throw refusalDe("the reading of the open PRs", ouvertes);
  const liste = Array.isArray(ouvertes.data) ? (ouvertes.data as unknown[]).map(objet) : [];
  const sienne = liste.find((pr) => typeof pr.number === "number" && ticketDeLaPR(String(objet(pr.head).ref ?? ""), typeof pr.body === "string" ? pr.body : "") === ticket);
  return sienne === undefined ? null : (sienne.number as number);
}

// Le geste joué sur l'issue de `ticket` — ce qu'il dit fait, ou l'erreur de GitHub.
async function jouer(repository: string, ticket: number, action: ActionDuChef, pr: number | null, libelle: string, question: string, maintenant: Date, client: ClientDeLaAnswer): Promise<string> {
  const issue = `/repos/${repository}/issues/${ticket}`;
  let fait = "";
  if (action === "wait") {
    const lue = saisieLue({ quoi: question, qui: attendu(libelle), relance: relanceProposee(maintenant) }, maintenant);
    if ("refus" in lue) throw new Error(lue.refus);
    const ecrit = await parquer(repository, ticket, lue, maintenant, client);
    if ("refus" in ecrit) throw new Error(`${ecrit.refus}${ecrit.detail === "" ? "" : ` — ${ecrit.detail}`}`);
    fait = ecrit.fait;
  }
  if (action === "merge" && pr !== null) {
    const mergee = await client.ecrire("PUT", `/repos/${repository}/pulls/${pr}/merge`, { merge_method: "merge" });
    if (mergee.status !== 200) throw refusalDe(`the merge of the ${PR_DU_TICKET(ticket)}`, mergee);
    fait = `the ${PR_DU_TICKET(ticket)} merged`;
  }
  if (action === "close") {
    const fermee = await client.ecrire("PATCH", issue, { state: "closed", state_reason: "not_planned" });
    if (fermee.status !== 200) throw refusalDe(`the closing of #${ticket}`, fermee);
    fait = `#${ticket} closed`;
  }
  if (action === "rail") {
    // L'issue d'un inconnu : le `prio:` que le choix nomme, sinon `fire`, comme « on the rail » du runtime.
    const label = /\bprio:([1-9])\b/.exec(libelle)?.[0] ?? LABEL_FIRE;
    const posee = await client.ecrire("POST", `${issue}/labels`, { labels: [label] });
    if (posee.status !== 200) throw refusalDe(`the \`${label}\` label`, posee);
    fait = `\`${label}\` put on #${ticket}`;
  }
  const retires: string[] = [];
  for (const label of RETIRES[action]) {
    const retire = await client.ecrire("DELETE", `${issue}/labels/${encodeURIComponent(label)}`);
    // Une issue qui ne le porte pas : rien à retirer.
    if (retire.status === 200) retires.push(`\`${label}\``);
    else if (retire.status !== 404) throw refusalDe(`the removal of \`${label}\``, retire);
  }
  const dits = [fait, retires.length === 0 ? "" : `${retires.join(" and ")} removed`].filter((dit) => dit !== "");
  return dits.length === 0 ? "nothing else to change on the issue" : dits.join(", ");
}

// La réponse du chef à la carte du chef de `ticket` — `chef`, celle que la dernière lecture porte —, jouée sur GitHub.
// Rien ne part pour une carte inconnue, changée, une réponse vide, ni un merge sans PR à merger. Le commentaire posté, un
// geste que GitHub refuse se dit : la réponse est écrite, le geste est à faire sur GitHub.
export async function repondreSurGithub({ depot: repository, ticket, chef, reponse: answer, client, maintenant = new Date() }: { depot: string; ticket: unknown; chef: CardDuChef | undefined; reponse: unknown; client: ClientDeLaAnswer; maintenant?: Date }): Promise<Rendu> {
  const connue = chef === undefined ? undefined : cardLueDuChef(chef);
  const lue = answerLue(connue, ticket, answer);
  if ("refus" in lue) return lue;
  const choisi = "choix" in lue ? connue?.choix[lue.choix - 1] : undefined;
  const action = (choisi?.suite ?? "resume") as ActionDuChef;
  let pr: number | null = null;
  if (action === "merge") {
    try {
      pr = await prNommee(repository, lue.ticket, choisi?.texte ?? "", client);
    } catch (error) {
      return { refus: `nothing was sent: the PR to merge for #${lue.ticket} was not read on GitHub`, detail: message(error) };
    }
    if (pr === null) return { refus: `nothing was sent: no open PR names #${lue.ticket} — the card has nothing to merge`, detail: "" };
  }
  let comment: number;
  try {
    const posee = await client.ecrire("POST", `/repos/${repository}/issues/${lue.ticket}/comments`, { body: commentDeAnswer(action, choisi?.texte ?? ("texte" in lue ? lue.texte : "")) });
    if (posee.status !== 201) throw refusalDe("the comment", posee);
    const id = objet(posee.data).id;
    comment = typeof id === "number" ? id : 0;
  } catch (error) {
    return { refus: `nothing was sent: your answer was not posted on #${lue.ticket}`, detail: message(error) };
  }
  try {
    const fait = await jouer(repository, lue.ticket, action, pr, choisi?.texte ?? "", connue?.question ?? "", maintenant, client);
    return { repondue: true, dit: `answer posted on #${lue.ticket} (${action}): ${fait}`, commentaire: comment };
  } catch (error) {
    return { refus: `your answer is posted on #${lue.ticket}, but its gesture (${action}) was not played — play it on GitHub`, detail: message(error) };
  }
}
