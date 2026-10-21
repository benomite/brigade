// La réponse du chef à une carte de TODO (carte-todo.ts) : un de ses choix,
// d'un clic, ou un texte libre. Un seul appel la règle : la réponse est écrite
// sur l'issue, la carte sort de TODO, et le ticket avance — le chef n'a pas
// d'autre geste à faire.
//
// Ce qui suit dépend du choix (`suite`) et de l'endroit où le ticket attend :
// - `merge` : la livraison verte qui attend le chef est mergée, comme par son
//   geste `rail merge` (geste-ticket.ts) — la pass le constate et sert le
//   ticket ;
// - `resume` (et toute réponse libre) : la cuisine reprend le ticket avec la
//   réponse. Une livraison qui attend le chef — verte, ou remontée — repart
//   chez un cook, qui lit la réponse à la place des findings ; un ticket 86
//   sans livraison revient sur le rail ; une issue retenue par
//   `blocked-on-human` perd son label, et le manager la rejuge, la réponse
//   sur l'issue ; un ticket en attente sur le rail y reste, et son cook lira
//   l'issue.
//
// L'ordre : tout ce qui peut refuser est vu avant d'écrire ; puis la réponse
// part sur l'issue — si GitHub la refuse, rien n'a changé — ; puis le journal
// (`todo.answered`, `todo.left`, et ce qui fait avancer le ticket), en une
// transaction ; puis ce qui reste à faire sur GitHub.
import { attentesDuChef } from "./attend.ts";
import { cartesEnTodo, type CarteEnTodo, type Suite } from "./carte-todo.ts";
import { mergerLaLivraison, type Resultat } from "./geste-ticket.ts";
import type { GitHub } from "./github.ts";
import type { Journal } from "./journal.ts";
import { EN_PAUSE_POUR_LE_RENOMMAGE, mergeRetenu } from "./pause/pause.ts";
import { passDuTicket } from "./projections/pass.ts";
import { lireRail, ticketDuRail } from "./projections/rail.ts";
import { RETENUE } from "./requalifier.ts";

const AUTEUR = "chef";

// Le motif du retour au rail d'un ticket dont le chef a répondu à la carte.
export const REPONSE_DU_CHEF = "chef-answered";

// Ce que le chef répond : le rang d'un choix, à partir de 1, ou son texte.
export type Reponse = { choix: number } | { texte: string };

const RIEN_TOUCHE = "none: nothing was changed";
const refuse = (reason: string): Resultat => ({ done: false, reason, price: RIEN_TOUCHE });

// Ce qui est écrit sur l'issue : la question, et la réponse.
export function direLaReponse(carte: CarteEnTodo, reponse: string, choix: number | null): string {
  return [`**The chef's answer** to the TODO card${choix === null ? ", in their own words" : ` — choice ${choix} of ${carte.choix.length}`}:`, "", `> ${carte.question}`, "", reponse].join("\n");
}

// Ce que le cook qui reprend le ticket lit, à la place des findings.
const pourLeCook = (carte: CarteEnTodo, reponse: string) => `Le chef a répondu à la question « ${carte.question} » : ${reponse}`;

// Comment le ticket avance, vu avant d'écrire quoi que ce soit — ou pourquoi
// il ne peut pas.
type Avancee =
  | { comment: "merge"; pr: string }
  | { comment: "renvoi"; branche: string; pr: string | null }
  | { comment: "rail" }
  | { comment: "label" }
  | { comment: "rien" }
  | { refus: string };

export async function repondreALaCarte(journal: Journal, github: GitHub, projet: string, ticket: number, reponse: Reponse): Promise<Resultat> {
  const { base } = journal;
  const carte = cartesEnTodo(base).find((autre) => autre.ticket === ticket);
  if (!carte) return refuse(`#${ticket} has no card in TODO`);

  let texte: string;
  let rang: number | null = null;
  let suite: Suite = "resume";
  if ("choix" in reponse) {
    const choisi = Number.isSafeInteger(reponse.choix) ? carte.choix[reponse.choix - 1] : undefined;
    if (reponse.choix < 1 || choisi === undefined) return refuse(`the card of #${ticket} offers choices 1 to ${carte.choix.length}`);
    ({ texte, suite } = choisi);
    rang = reponse.choix;
  } else {
    texte = reponse.texte.trim();
    if (texte === "") return refuse("an answer in your own words says something: it is empty");
  }

  const avancee = ((): Avancee => {
    const sur = ticketDuRail(base, ticket);
    const livraison = passDuTicket(base, ticket);
    if (suite === "merge") {
      const pause = mergeRetenu(base, ticket);
      if (pause !== null) return { refus: `${EN_PAUSE_POUR_LE_RENOMMAGE} since ${pause.agreedAt}: no other merge until it ends — answer once the pause is over` };
      const aMerger = attentesDuChef(base, lireRail(base)).some((autre) => autre.ticket === ticket && autre.quoi === "merge");
      if (!aMerger || livraison?.branch == null) return { refus: `this choice merges the delivery of #${ticket}, but no green delivery of it waits to be merged` };
      return { comment: "merge", pr: livraison.pr ?? livraison.branch };
    }
    // Une livraison qui attend le chef : verte et retenue par la pass, ou
    // remontée et mise de côté.
    const attend = livraison?.branch != null && ((sur?.state === "pass" && livraison.phase === "held") || (sur?.state === "86" && livraison.phase === "escalated"));
    if (attend) return { comment: "renvoi", branche: livraison.branch as string, pr: livraison.pr };
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

  // Hors du rail, seule une issue retenue par `blocked-on-human` avance : le
  // label s'en va, le manager la rejuge.
  const retenue = avancee.comment === "label" ? ((await github.issue(ticket))?.labels.includes(RETENUE) ?? false) : false;

  await github.commenter(ticket, direLaReponse(carte, texte, rang));

  if (avancee.comment === "merge") {
    const merge = await mergerLaLivraison(journal, github, ticket);
    if (!merge.done) return { done: false, reason: `your answer is on the issue, but the merge did not go: ${merge.reason}`, price: "your answer is written on the issue; the card stays in TODO" };
  }

  base.transaction(() => {
    const commun = { project: projet, ticket, author: AUTEUR } as const;
    journal.ajouter({ ...commun, type: "todo.answered", payload: { choice: rang, answer: texte, then: suite } });
    journal.ajouter({ ...commun, type: "todo.left", payload: { why: `answered by the chef${rang === null ? "" : ` (choice ${rang})`}` } });
    if (avancee.comment === "renvoi") {
      const livraison = passDuTicket(base, ticket);
      journal.ajouter({ ...commun, type: "pass.returned", payload: { n: (livraison?.returns ?? 0) + 1, findings: [pourLeCook(carte, texte)] } });
    }
    if (avancee.comment === "renvoi" || avancee.comment === "rail") journal.ajouter({ ...commun, type: "ticket.released", payload: { reason: REPONSE_DU_CHEF, station: ticketDuRail(base, ticket)?.station ?? null } });
  });

  if (retenue) await github.delabelliser(ticket, RETENUE);

  const ecrite = "your answer is written on the issue";
  switch (avancee.comment) {
    case "merge":
      return { done: true, price: `${ecrite}, and ${avancee.pr} is merged under the box's GitHub account; the pass sees it at its next tick and serves the ticket. A merge is not undone from here` };
    case "renvoi":
      return { done: true, price: `${ecrite}; a cook is launched again on ${avancee.branche}, on the project's quota, and reads it in place of the findings${avancee.pr ? `; ${avancee.pr} stays open` : ""}` };
    case "rail":
      return { done: true, price: `${ecrite}; the ticket goes back to the rail, queued: a cook takes it up on the project's quota and reads your answer on the issue` };
    case "label":
      return retenue
        ? { done: true, price: `${ecrite}, and \`${RETENUE}\` is removed: the manager judges the issue again with your answer, on the project's quota` }
        : { done: true, price: `${ecrite}; the issue is not on the rail, and nothing else moves` };
    case "rien":
      return { done: true, price: `${ecrite}; the ticket is queued on the rail, and its cook reads your answer on the issue` };
  }
}
