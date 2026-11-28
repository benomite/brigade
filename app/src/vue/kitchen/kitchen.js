// @ts-check
// Le TODO du chef, à côté des colonnes du kanban (ticket 4261) : une ligne, « 2 wait for you », dont un clic montre chaque
// entrée, ce qui lui est demandé et ses boutons (ticket 4354). Ce qui est parked pour le chef y est, et rien d'autre.
// Il ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { recommendationOf } from "../bricks.js";
import { answerSaid, seenOfTheCard } from "../card-todo.js";
import { button } from "../components/button/button.js";
import { parkedTodo } from "../parked/parked-todo.js";
import { CHEF, chefRecords } from "../parked/records.js";
import { isRed } from "../todo/todo.js";

/** @typedef {import("../../facts.ts").Card} Card */
/** @typedef {import("../../facts.ts").Column} Column */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Ce qui attend le chef, une fois chacun : le TODO.
/** @param {readonly Column[]} columns */
export const whatAwaitingYou = (columns) => {
  const seenOnes = new Set();
  return columns.flatMap(({ cartes: cards }) => cards.filter(isRed)).filter(({ ticket }) => (seenOnes.has(ticket) ? false : (seenOnes.add(ticket), true)));
};

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (/** @type {number} */ n) => String(n).padStart(2, "0");
// Une date de la box, en UTC : « 28 Nov, 09:00 UTC ». Illisible, elle est dite telle quelle.
/** @param {string} iso */
const dayUtc = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${date.getUTCDate()} ${MONTH[date.getUTCMonth()]}, ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
};

// La phrase d'une carte parked : qui elle attend, et jusqu'à quand.
/** @param {NonNullable<Card["parque"]>} parque */
const saysParked = ({ qui: who, jusqua: until }) => `parked — waits for ${who}, ${until === null ? "no date set" : `until ${dayUtc(until)}`}`;

// La ligne parked d'une carte, sous sa tête.
/** @param {Fabrique} doc @param {NonNullable<Card["parque"]>} parked */
export function lineParked(doc, parked) {
  const line = doc.createElement("p");
  line.className = "parque";
  line.textContent = saysParked(parked);
  return line;
}

// Les gestes qui tranchent une carte du TODO d'un clic, chacun par son nom (vue.js les joue) : répondre d'un choix.
/** @typedef {"repondre"} KindOfAction */
/** @typedef {{ texte: string, recommande: boolean, sorte: KindOfAction, reponse?: import("../../card-todo.ts").Answer, ouvre?: true }} ActionOfTodo */
/**
 * Ce que le TODO sait de la vue pour trancher ses cartes : où en est la réponse d'une carte (`etat`), et de quoi jouer un geste (`jouer`).
 * @typedef {{ etat: (ticket: number, todo: import("../../card-todo.ts").CardOfTodo) => import("../card-todo.js").State, jouer: (ticket: number, kind: KindOfAction, answer?: import("../../card-todo.ts").Answer) => void }} ActionsOfTodo
 */

// Pourquoi une entrée du TODO se lit sans bouton.
const READ_ONLY = "read-only: nothing is decided from here";

/**
 * Les boutons d'une carte du TODO, ceux de sa carte (ticket 4261) : un par choix d'une question — le recommandé plein d'accent —, tant que sa réponse n'est pas partie d'ici.
 * Aucun sur une carte qui ne se tranche qu'en mots : un clic sur son entrée ouvre sa carte et son champ.
 * @param {Card} card @param {ActionsOfTodo} actions @returns {ActionOfTodo[]}
 */
export function actionsOfTodo(card, actions) {
  const { todo } = card;
  if (todo === undefined) return [];
  if (!["repos", "refus"].includes(seenOfTheCard(todo, actions.etat(card.ticket, todo)).vu)) return [];
  // Une carte qui ne se répond qu'en mots (`parked:chef`) : son bouton ouvre sa carte, où le chef écrit sa réponse.
  if (todo.choix.length === 0 && todo.repondre !== undefined) return [{ texte: todo.repondre, recommande: true, sorte: "repondre", ouvre: true }];
  const recommended = recommendationOf(todo)?.rang;
  return todo.choix.map(({ texte: text }, rank) => ({ texte: text, recommande: rank + 1 === recommended, sorte: "repondre", reponse: { question: todo.question, choix: rank + 1 } }));
}

/**
 * Le TODO du chef, en une ligne au-dessus des colonnes (ticket 4354) : « 2 wait for you ». Un clic montre, sous elle, une
 * entrée par ticket parked pour lui (ticket 4261) — son numéro et son titre, dont un clic ouvre sa carte ; ce qui lui est
 * demandé ; qui, jusqu'à quand ; ses boutons, qui y répondent. Les entrées sont celles du TODO parked (parked/, ticket
 * 4281). `deplie` garde, d'un rendu à l'autre, que le chef
 * l'a ouvert. Sans `gestes` — un projet en lecture seule —, ses cartes se lisent sans bouton. Rien du tout quand rien ne
 * l'attend. `answered` et `later` (ticket 4646) gardent d'un rendu à l'autre les entrées répondues d'ici, repliées sur la
 * réponse envoyée, et celles que le chef a remises à plus tard : une carte partie du TODO les quitte ; une réponse refusée
 * rend ses boutons ; une carte répondue ailleurs — sa fiche — se replie sur sa réponse aussi.
 * @param {Fabrique} doc @param {{ cartes: readonly Card[], ouvrir: (card: Card) => void, gestes?: ActionsOfTodo, deplie: { ouvert: boolean }, answered?: Map<number, string>, later?: Set<number> }} todo
 */
export function setTheTodo(doc, { cartes: cards, ouvrir: open, gestes: actions, deplie: unfolded, answered = new Map(), later = new Set() }) {
  const present = new Set(cards.map(({ ticket }) => ticket));
  for (const ticket of [...answered.keys(), ...later]) if (!present.has(ticket)) void (answered.delete(ticket), later.delete(ticket));
  for (const { ticket, todo } of cards) {
    if (actions === undefined || todo === undefined) continue;
    const state = actions.etat(ticket, todo);
    const seen = seenOfTheCard(todo, state);
    if (seen.vu === "refus") answered.delete(ticket);
    else if (seen.vu === "attente" || seen.vu === "jouee") answered.set(ticket, seen.reponse);
    else if (state.etape === "envoi" && !answered.has(ticket)) answered.set(ticket, answerSaid(todo, state.reponse));
  }
  if (cards.length === 0) return undefined;
  const byTicket = new Map(cards.map((card) => [card.ticket, { carte: card, siens: actions === undefined ? [] : actionsOfTodo(card, actions) }]));
  /** @param {number} ticket */
  const of = (ticket) => /** @type {{ carte: Card, siens: ActionOfTodo[] }} */ (byTicket.get(ticket));
  const entries = () =>
    parkedTodo(doc, {
      records: chefRecords(cards),
      chef: CHEF,
      choices: ({ ticket }) => of(ticket).siens,
      answer: (ticket, text) => {
        const action = of(ticket).siens.find((itsOwn) => itsOwn.texte === text);
        if (action !== undefined && action.ouvre !== true) actions?.jouer(ticket, action.sorte, action.reponse);
      },
      ...(actions === undefined ? { readOnly: READ_ONLY } : { answered, later }),
      open: (ticket) => open(of(ticket).carte),
      openTitle: (ticket) => {
        const { parque: parked } = of(ticket).carte;
        return parked === undefined ? `open #${ticket}'s card` : `open #${ticket}'s card — ${saysParked(parked)}`;
      },
    });
  const opinion = doc.createElement("div");
  opinion.className = "avis-du-todo";
  /** @type {any} */
  let list = unfolded.ouvert ? entries() : undefined;
  const line = button(
    doc,
    `${cards.length} ${cards.length === 1 ? "waits" : "wait"} for you`,
    () => {
      unfolded.ouvert = list === undefined;
      list?.remove();
      list = unfolded.ouvert ? entries() : undefined;
      if (list !== undefined) opinion.append(list);
      line.ariaExpanded = String(unfolded.ouvert);
    },
    { sorte: "discret" },
  );
  line.className += " ligne-du-todo";
  line.ariaExpanded = String(unfolded.ouvert);
  line.title = "open your TODO: each ticket, its question and its buttons";
  opinion.append(line, ...(list === undefined ? [] : [list]));
  return opinion;
}



// Un message porte un geste : un bouton, à lui ou à ce qui le suit.
/** @param {readonly any[]} message */
export const aOneAction = (message) => message.some((element) => element.querySelectorAll("button").length > 0);

