// La réponse du chef à une carte de TODO (carte-todo/cartes.ts) : un de ses
// choix, d'un clic, ou un texte libre. Un seul appel la règle : la réponse est
// écrite sur l'issue, la carte sort de TODO, et le ticket avance — le chef n'a
// pas d'autre geste à faire. Toute carte se répond : celle qu'une carte de la
// porte pose (carte-todo.ts), comme celle de toute autre attente du ticket
// (une livraison verte, une remontée, un 86…) ; c'est la carte que `faits`
// montre, celle de sa première entrée de la file.
//
// Ce qui suit dépend du choix (`suite`) et de l'endroit où le ticket attend :
// - `merge` : la livraison qui attend le chef d'être mergée — verte, ou
//   remontée avec sa PR — l'est, comme par son geste `rail merge`
//   (geste-ticket.ts) — la pass le constate et sert le ticket ;
// - `drop` : le ticket sort du rail, comme par son geste `rail drop`
//   (geste-ticket.ts) — son label `fire` est retiré ;
// - `resume` (et toute réponse libre) : la cuisine reprend le ticket avec la
//   réponse. Une livraison qui attend le chef — verte, ou remontée — repart
//   chez un cook, qui lit la réponse à la place des findings ; un ticket 86
//   sans livraison, ou dont la PR a été fermée sans merge, revient sur le
//   rail ; une issue retenue par `blocked-on-human`, ou écartée par le manager
//   sous `question` ou `decision`, perd ce label, et le manager la rejuge, la
//   réponse sur l'issue ; un ticket en attente sur le rail y reste, et son
//   cook lira l'issue.
//
// L'ordre : tout ce qui peut refuser est vu avant d'écrire ; puis la réponse
// part sur l'issue — si GitHub la refuse, rien n'a changé — ; puis le journal
// (`todo.answered`, `todo.left` pour une carte de la porte, et ce qui fait
// avancer le ticket), en une transaction ; puis ce qui reste à faire sur
// GitHub.
import { mettreEnAttente } from "./attente.ts";
import { cartesEnTodo, type Suite } from "./carte-todo.ts";
import { carteDuTicket, type CarteDuTicket } from "./carte-todo/cartes.ts";
import { mergerLaLivraison, retirerDuRail, type Resultat } from "./geste-ticket.ts";
import type { GitHub } from "./github.ts";
import type { Journal } from "./journal.ts";
import { EN_PAUSE_POUR_LE_RENOMMAGE, mergeRetenu } from "./pause/pause.ts";
import { passDuTicket } from "./projections/pass.ts";
import { ticketDuRail } from "./projections/rail.ts";
import { RETENUE } from "./requalifier.ts";

const AUTEUR = "chef";

// Le motif du retour au rail d'un ticket dont le chef a répondu à la carte.
export const REPONSE_DU_CHEF = "chef-answered";

// Ce que le chef répond : le rang d'un choix, à partir de 1, ou son texte.
export type Reponse = { choix: number } | { texte: string };

// Ce que la carte demande, tel que l'issue et le cook le lisent : sa question,
// ou, sur une carte à un seul geste, ce qu'elle dit.
const demande = (carte: CarteDuTicket) => carte.question ?? carte.resume;

const RIEN_TOUCHE = "none: nothing was changed";
const refuse = (reason: string): Resultat => ({ done: false, reason, price: RIEN_TOUCHE });

// Ce qui est écrit sur l'issue : la question, et la réponse.
export function direLaReponse(carte: CarteDuTicket, reponse: string, choix: number | null): string {
  return [`**The chef's answer** to the TODO card${choix === null ? ", in their own words" : ` — choice ${choix} of ${carte.choix.length}`}:`, "", `> ${demande(carte)}`, "", reponse].join("\n");
}

// Ce que le cook qui reprend le ticket lit, à la place des findings.
const pourLeCook = (carte: CarteDuTicket, reponse: string) => `Le chef a répondu à la question « ${demande(carte)} » : ${reponse}`;

// Comment le ticket avance, vu avant d'écrire quoi que ce soit — ou pourquoi
// il ne peut pas.
type Avancee =
  | { comment: "merge"; pr: string }
  | { comment: "retrait" }
  | { comment: "renvoi"; branche: string; pr: string | null }
  | { comment: "rail" }
  | { comment: "attente"; quoi: string; qui: string }
  | { comment: "label" }
  | { comment: "rien" }
  | { refus: string };

export async function repondreALaCarte(journal: Journal, github: GitHub, projet: string, ticket: number, reponse: Reponse): Promise<Resultat> {
  const { base } = journal;
  const enTodo = carteDuTicket(base, ticket);
  if (!enTodo) return refuse(`#${ticket} has no card in TODO`);
  const { attente, carte, attentes } = enTodo;

  let texte: string;
  let rang: number | null = null;
  let suite: Suite = "resume";
  if ("choix" in reponse) {
    const choisi = Number.isSafeInteger(reponse.choix) ? carte.choix[reponse.choix - 1] : undefined;
    if (reponse.choix < 1 || choisi === undefined) return refuse(`the card of #${ticket} offers choices 1 to ${carte.choix.length}`);
    ({ texte, suite } = choisi);
    rang = reponse.choix;
  } else {
    if (!carte.reponseLibre) return refuse(`the card of #${ticket} takes no answer in your own words: pick one of its choices`);
    texte = reponse.texte.trim();
    if (texte === "") return refuse("an answer in your own words says something: it is empty");
  }

  const sur = ticketDuRail(base, ticket);
  const avancee = ((): Avancee => {
    const livraison = passDuTicket(base, ticket);
    if (suite === "merge") {
      const pause = mergeRetenu(base, ticket);
      if (pause !== null) return { refus: `${EN_PAUSE_POUR_LE_RENOMMAGE} since ${pause.agreedAt}: no other merge until it ends — answer once the pause is over` };
      // Verte, ou remontée avec sa PR : ce que `rail merge` merge (geste-ticket.ts).
      const aMerger = attentes.some((autre) => autre.quoi === "merge" || (autre.quoi === "remontee" && autre.pr !== null));
      if (!aMerger || livraison?.branch == null) return { refus: `this choice merges the delivery of #${ticket}, but no green delivery of it waits to be merged` };
      return { comment: "merge", pr: livraison.pr ?? livraison.branch };
    }
    if (suite === "drop") {
      if (!sur) return { refus: `this choice takes #${ticket} off the rail, but it is not on the rail` };
      return { comment: "retrait" };
    }
    if (suite === "wait") {
      const attendait = attente.quoi === "repris" ? attente.attendait : null;
      if (sur?.state !== "86" || attendait === null) return { refus: `this choice puts #${ticket} back in WAITING, but it is not back from WAITING` };
      return { comment: "attente", quoi: attendait.what, qui: attendait.who };
    }
    // Une livraison qui attend le chef : verte et retenue par la pass, ou
    // remontée et mise de côté.
    const attend = livraison?.branch != null && ((sur?.state === "pass" && livraison.phase === "held") || (sur?.state === "86" && livraison.phase === "escalated"));
    if (attend) return { comment: "renvoi", branche: livraison.branch as string, pr: livraison.pr };
    // Sa PR fermée sans merge, le ticket tient encore sa place : il repart.
    if (attente.quoi === "fermee" && (sur?.state === "pass" || sur?.state === "86")) return { comment: "rail" };
    switch (sur?.state) {
      case "taken":
        return { refus: `a cook is working on #${ticket}: answer once it has delivered` };
      case "pass":
        return { refus: `the pass is judging the delivery of #${ticket}: answer once it is done` };
      case "86":
        return { comment: "rail" };
      case "waiting":
        return { comment: "rien" };
      default:
        return { comment: "label" };
    }
  })();
  if ("refus" in avancee) return refuse(avancee.refus);

  // Hors du rail, seule une issue retenue avance : par `blocked-on-human`, ou
  // écartée par le manager sous le label de sa question — le label s'en va, le
  // manager la rejuge.
  const aLever = avancee.comment !== "label" ? null : attente.quoi === "ecartee" && attente.reason !== "blocked-on-human" ? attente.reason : RETENUE;
  const leve = aLever === null ? null : ((await github.issue(ticket))?.labels.includes(aLever) ?? false) ? aLever : null;

  await github.commenter(ticket, direLaReponse(carte, texte, rang));

  if (avancee.comment === "merge") {
    const merge = await mergerLaLivraison(journal, github, ticket);
    if (!merge.done) return { done: false, reason: `your answer is on the issue, but the merge did not go: ${merge.reason}`, price: "your answer is written on the issue; the card stays in TODO" };
  }
  if (avancee.comment === "retrait") {
    const retrait = await retirerDuRail(journal, github, projet, ticket);
    if (!retrait.done) return { done: false, reason: `your answer is on the issue, but the ticket did not leave the rail: ${retrait.reason}`, price: "your answer is written on the issue; the card stays in TODO" };
  }

  const deLaPorte = cartesEnTodo(base).some((autre) => autre.ticket === ticket);
  base.transaction(() => {
    const commun = { project: projet, ticket, author: AUTEUR } as const;
    journal.ajouter({ ...commun, type: "todo.answered", payload: { choice: rang, answer: texte, then: suite } });
    if (deLaPorte) journal.ajouter({ ...commun, type: "todo.left", payload: { why: `answered by the chef${rang === null ? "" : ` (choice ${rang})`}` } });
    if (avancee.comment === "renvoi") {
      const livraison = passDuTicket(base, ticket);
      journal.ajouter({ ...commun, type: "pass.returned", payload: { n: (livraison?.returns ?? 0) + 1, findings: [pourLeCook(carte, texte)] } });
    }
    if (avancee.comment === "attente") mettreEnAttente(journal, projet, ticket, { quoi: avancee.quoi, qui: avancee.qui });
    if (avancee.comment === "renvoi" || avancee.comment === "rail") journal.ajouter({ ...commun, type: "ticket.released", payload: { reason: REPONSE_DU_CHEF, station: ticketDuRail(base, ticket)?.station ?? null } });
  });

  if (leve !== null) await github.delabelliser(ticket, leve);

  const ecrite = "your answer is written on the issue";
  switch (avancee.comment) {
    case "merge":
      return { done: true, price: `${ecrite}, and ${avancee.pr} is merged under the box's GitHub account; the pass sees it at its next tick and serves the ticket. A merge is not undone from here` };
    case "retrait":
      return { done: true, price: `${ecrite}; the ticket leaves the rail and is not cooked — its issue stays open and loses its \`fire\` label, put it back to bring the ticket back on the rail` };
    case "renvoi":
      return { done: true, price: `${ecrite}; a cook is launched again on ${avancee.branche}, on the project's quota, and reads it in place of the findings${avancee.pr ? `; ${avancee.pr} stays open` : ""}` };
    case "attente":
      return { done: true, price: `${ecrite}; the ticket is back in WAITING for the same thing, with a new reminder in 7 days — it leaves only on your gesture or on that date` };
    case "rail":
      return { done: true, price: `${ecrite}; the ticket goes back to the rail, queued: a cook takes it up on the project's quota and reads your answer on the issue` };
    case "label":
      return leve !== null
        ? { done: true, price: `${ecrite}, and \`${leve}\` is removed: the manager judges the issue again with your answer, on the project's quota` }
        : { done: true, price: `${ecrite}; the issue is not on the rail, and nothing else moves` };
    case "rien":
      return { done: true, price: `${ecrite}; the ticket is queued on the rail, and its cook reads your answer on the issue` };
  }
}
