// @ts-check
// Le récapitulatif de l'accueil (ticket 3581, épique 3579) : à l'ouverture de l'app, pour chaque projet, ce que la cuisine a
// fait depuis que le chef a regardé — les tickets servis, chacun avec le lien de sa PR, où se voient ses gates, sa CI et sa
// relecture ; ceux que la pass a renvoyés ou refusés, avec leur raison en une ligne ; une ligne par arrêt d'un garde-fou ;
// puis ce qui attend le chef dans TODO, la liste même que TODO montre à cet instant. Rien depuis : une phrase le dit, le
// récapitulatif n'est ni caché ni vide.
//
// Le récapitulatif vient du runtime du projet (`recap`, runtime/src/recap/), par le process principal (recap-box.ts) ; ce
// qui attend dans TODO, de la vue — les cartes rouges du rail rangé (todo/todo.js), que l'entrée « TODO (N) » compte.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { READ_OF, NOT_REACHED } from "../lexicon.js";
import { isRed, tidyTheRail } from "../todo/todo.js";
import { tellThePrParItsTicket, PR_OF_TICKET } from "../pr-of-ticket.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./recap-box.ts").ReadOfRecap} Reading */
/** @typedef {import("./recap-box.ts").Recap} Recap */
/** @typedef {{ ticket: number, texte: string }} InTodo */
/** @typedef {{ projet: string, lecture: Reading | undefined, todo: InTodo[] | undefined }} OfProject */

const TITLE = "Since you last looked";
const SERVED = "Served";
const SENT_BACK = "Sent back or refused by the pass";
const STOPS = "Stopped by a guardrail";
const NOTHING = "Nothing happened since you last looked.";
const NOTHING_IN_TODO = "Nothing is waiting for you in TODO.";
const UNAVAILABLE = NOT_REACHED("recap");
const AWAITING_IN_TODO = "Waiting for you in TODO";
/** @param {number} count */
const IN_TODO = (count) => `${AWAITING_IN_TODO} (${count})`;
const HOVER_OF_THE_PR = "its gates, CI and review, on GitHub";
/** @param {string} instant */
const SINCE = (instant) => `Since ${new Date(instant).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}.`;
/** @param {Recap["sentBack"][number]} renvoi */
// La PR que la raison nomme est la livraison du ticket : elle se dit par lui (pr-of-ticket.js, ticket 3716).
const LINE_OF_SEND_BACK = ({ ticket, kind, reason }) => `#${ticket} ${kind === "refused" ? "refused" : "sent back to a cook"}: ${tellThePrParItsTicket(reason.replace(/`([^`]*)`/g, "$1"), ticket)}`;

/**
 * Ce qui attend le chef dans TODO, tel que TODO le montre : les cartes rouges du rail rangé, dans l'ordre de leurs
 * colonnes — celles que compte « TODO (N) ». `undefined` tant que le rail n'est pas lu.
 * @param {readonly import("../../facts.ts").Column[] | undefined} columns
 * @returns {InTodo[] | undefined}
 */
export function whatAwaitingInTodo(columns) {
  if (columns === undefined) return undefined;
  const { colonnes: rows, compte: account } = tidyTheRail(columns);
  if (account === "?") return undefined;
  return rows.flatMap(({ cartes: cards }) => cards.filter(isRed).map((card) => ({ ticket: card.ticket, texte: card.todo?.question ?? card.titre ?? card.ligne ?? "" })));
}

/**
 * Le bloc de l'accueil : un récapitulatif par projet. `gestes.ouvrir(url)` ouvre la PR d'un ticket servi.
 * @param {Fabrique} doc
 * @param {OfProject[]} projects
 * @param {{ ouvrir: (url: string) => void }} actions
 */
export function setTheRecap(doc, projects, actions) {
  const root = doc.createElement("section");
  root.id = "accueil-recap";
  root.className = "bloc-de-l-accueil recap";
  root.ariaLabel = TITLE;
  const title = doc.createElement("h2");
  title.textContent = TITLE;
  root.append(title, ...projects.map((project) => ofProject(doc, project, actions)));
  return root;
}

/** @param {Fabrique} doc @param {string} text */
const subheading = (doc, text) => {
  const h4 = doc.createElement("h4");
  h4.textContent = text;
  return h4;
};

/** @param {Fabrique} doc @param {string} classe @param {any[]} lines */
const list = (doc, classe, lines) => {
  const ul = doc.createElement("ul");
  ul.className = classe;
  ul.append(...lines);
  return ul;
};

/** @param {Fabrique} doc @param {string} text */
const lineOf = (doc, text) => {
  const li = doc.createElement("li");
  const said = doc.createElement("span");
  said.textContent = text;
  li.append(said);
  return li;
};

/** @param {Fabrique} doc @param {OfProject} projet @param {{ ouvrir: (url: string) => void }} gestes */
function ofProject(doc, { projet: project, lecture: reading, todo }, { ouvrir: open }) {
  const section = doc.createElement("section");
  section.className = "recap-du-projet";
  section.ariaLabel = project;
  section.dataset.projet = project;
  const name = doc.createElement("h3");
  name.textContent = project;
  section.append(name);
  if (reading === undefined) section.append(lineEmpty(doc, READ_OF("the recap")));
  else if ("sans" in reading) section.append(lineError(doc, UNAVAILABLE, [reading.sans, reading.detail ?? ""].filter(Boolean).join("\n")));
  else {
    const { since, served, sentBack, stops } = reading.recap;
    const sinceWhen = doc.createElement("p");
    sinceWhen.className = "depuis";
    sinceWhen.textContent = SINCE(since);
    section.append(sinceWhen);
    if (served.length + sentBack.length + stops.length === 0) {
      const nothing = doc.createElement("p");
      nothing.className = "rien";
      nothing.textContent = NOTHING;
      section.append(nothing);
    }
    if (served.length > 0) {
      section.append(
        subheading(doc, SERVED),
        list(
          doc,
          "servis",
          served.map(({ ticket, title, prUrl }) => {
            const li = lineOf(doc, `#${ticket} ${title}`);
            const link = button(doc, PR_OF_TICKET(ticket), () => open(prUrl), { sorte: "discret" });
            link.className += " pr";
            link.title = `${HOVER_OF_THE_PR} — ${prUrl}`;
            li.dataset.ticket = String(ticket);
            li.append(link);
            return li;
          }),
        ),
      );
    }
    if (sentBack.length > 0) section.append(subheading(doc, SENT_BACK), list(doc, "renvoyes", sentBack.map((sendBack) => lineOf(doc, LINE_OF_SEND_BACK(sendBack)))));
    if (stops.length > 0) section.append(subheading(doc, STOPS), list(doc, "arrets", stops.map(({ line }) => lineOf(doc, line))));
  }
  if (todo === undefined) section.append(subheading(doc, AWAITING_IN_TODO), lineEmpty(doc, READ_OF("TODO")));
  else section.append(subheading(doc, IN_TODO(todo.length)), todo.length === 0 ? lineEmpty(doc, NOTHING_IN_TODO) : list(doc, "dans-todo", todo.map(({ ticket, texte: text }) => lineOf(doc, `#${ticket} ${text}`.trim()))));
  return section;
}
