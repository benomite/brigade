// @ts-check
// La vue du projet dessine le plan de la cuisine (ticket 4238, docs/superpowers/specs/2026-11-24-simplified-process.md) :
// de gauche à droite, le backlog — le rail en tête, les tickets prêts à part —, le manager, les cooks, la pass, servi. Une
// carte est dans la colonne de son étape. Une carte parked reste dans la colonne où elle attend, dessinée parked : qui elle
// attend, jusqu'à quand. Il n'y a pas de colonne Waiting. Ce qui est parked pour le chef est aussi dans son TODO, à côté
// des colonnes, et rien d'autre (ticket 4261) : une ligne, « 2 wait for you », dont un clic montre chaque entrée, ce qui
// lui est demandé et ses boutons (ticket 4354). Au-dessus, la bande du haut : une carte du supervisor et une du closer sur
// une ligne, et au plus un message — jamais sans un geste que le chef peut faire.
// Le process principal range le rail en colonnes (facts.ts) : On the rail, Taken, Pass, Waiting, Served, et la liste de ce
// qui attend le chef, que todo.js pose déjà dans la colonne de son étape. Ce module en tire le plan, sans rien relire.
// Il ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { recommendationOf } from "../bricks.js";
import { seenOfTheCard } from "../card-todo.js";
import { button } from "../components/button/button.js";
import { hourUtc } from "../activity-of-cook.js";
import { brand } from "../components/pill/pill.js";
import { NOT_STILL } from "../lexicon.js";
import { parkedTodo } from "../parked/parked-todo.js";
import { CHEF, chefRecords } from "../parked/records.js";
import { isRed } from "../todo/todo.js";
import { isOneValidation, VALIDATE } from "../validation-design/validation-design.js";

/** @typedef {import("../../facts.ts").Card} Card */
/** @typedef {import("../../facts.ts").Column} Column */
/** @typedef {import("../../facts.ts").RoleOfKitchen} RoleOfKitchen */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Les cinq colonnes du plan, dans l'ordre du service (spec, « The plan of the kitchen »).
const BACKLOG = "Backlog";
const MANAGER = "Manager";
export const COOKS = "Cooks";
export const PASS = "Pass";
const SERVED = "Served";
// Le haut du backlog : le rail, ce qui est calibré et prêt (spec, règle 2) ; puis le reste du backlog.
export const OF_RAIL = "Rail — ready to cook";
export const NOT_READY = "Not ready yet";
export const NOTHING_OF_READY = "no ticket is ready on the rail";
const NOTHING_AT_MANAGER = "no ticket with the manager";

// La colonne de facts.ts d'où vient chaque colonne du plan. Waiting n'en a pas : ses cartes vont dans la colonne de leur étape.
/** @type {Record<string, string>} */
const OF_FACTS = { "On the rail": BACKLOG, Taken: COOKS, Pass: PASS, Served: SERVED };
const WAITING = "Waiting";
// L'étape d'une carte d'après son mot d'état : un mot qui n'en dit aucune laisse la carte dans le backlog.
/** @type {Record<string, string>} */
const STEP_OF_WORD = { pris: COOKS, "en pass": PASS, "base rouge": PASS, servi: SERVED };
// Les mots d'un ticket prêt à cuire, sur le rail.
const READY = ["en attente", "tests écrits"];
/** @type {Record<string, string>} */
const TONES = { [BACKLOG]: "gris", [MANAGER]: "gris", [COOKS]: "bleu", [PASS]: "jaune", [SERVED]: "vert" };

// Une carte du manager : sa question avant de découper une épique, posée au chef ou répondue et qu'il doit lire.
/** @param {Card} card */
const atManager = (card) => card.question === true || card.repondue !== undefined;

// La colonne du plan d'une carte, d'après la colonne de facts.ts où elle est : celle de son étape.
/** @param {string} nameOfFacts @param {Card} card */
export const columnOfPlan = (nameOfFacts, card) => (atManager(card) ? MANAGER : nameOfFacts === WAITING ? (STEP_OF_WORD[card.etat ?? ""] ?? BACKLOG) : (OF_FACTS[nameOfFacts] ?? BACKLOG));

/**
 * @typedef {{ nom: string, ton: string, compte: string, cartes: Card[], vide: string, defile?: boolean, pretes?: Card[], pasPretes?: Card[] }} ColumnOfPlan
 */

/**
 * Le plan, des colonnes que todo.js a rangées : chaque carte dans la colonne de son étape, les rouges en tête. Le backlog
 * sépare le rail — ce qui est prêt à cuire — du reste. `rail` : les numéros du haut du backlog que la lecture porte
 * (vue/rail/, ticket 4223), dans leur ordre ; donné, le rail du backlog est celui-là — les mêmes tickets, dans le même
 * ordre —, et un ticket prêt qui n'y est pas passe dessous.
 * @param {readonly Column[]} columns @param {readonly number[]} [rail]
 * @returns {ColumnOfPlan[]}
 */
export function planOfTheKitchen(columns, rail) {
  /** @type {Map<string, { cartes: Card[], vide?: string, defile?: boolean }>} */
  const plan = new Map([BACKLOG, MANAGER, COOKS, PASS, SERVED].map((name) => [name, { cartes: [] }]));
  // Une colonne de facts.ts pas connue — la box ne répond pas — laisse tout le plan inconnu : ses cartes iraient n'importe où.
  const unknown = columns.find(({ compte: account }) => account === "?");
  for (const column of columns) {
    const name = OF_FACTS[column.nom];
    const place = plan.get(name ?? "");
    if (place !== undefined) {
      place.vide = column.vide;
      if (column.defile === true) place.defile = true;
    }
    for (const card of column.cartes) plan.get(columnOfPlan(column.nom, card))?.cartes.push(card);
  }
  return [...plan].map(([name, { cartes: cards, vide: empty, defile: scrolls }]) => {
    const rows = [...cards.filter(isRed), ...cards.filter((card) => !isRed(card))];
    const column = {
      nom: name,
      ton: TONES[name] ?? "gris",
      compte: unknown === undefined ? String(rows.length) : "?",
      cartes: rows,
      vide: unknown !== undefined && name === MANAGER ? unknown.vide : name === MANAGER ? NOTHING_AT_MANAGER : (empty ?? "no ticket"),
      ...(scrolls === true ? { defile: scrolls } : {}),
    };
    if (name !== BACKLOG) return column;
    const ready = (/** @type {Card} */ card) => !isRed(card) && card.parque === undefined && READY.includes(card.etat ?? "");
    const readyEntries = rail === undefined ? rows.filter(ready) : rail.flatMap((ticket) => rows.filter((card) => card.ticket === ticket && ready(card)));
    return { ...column, pretes: readyEntries, pasPretes: rows.filter((card) => !readyEntries.includes(card)) };
  });
}

// Ce qui attend le chef, dans l'ordre du plan, une fois chacun : le TODO.
/** @param {readonly ColumnOfPlan[]} plan */
export const whatAwaitingYou = (plan) => {
  const seenOnes = new Set();
  return plan.flatMap(({ cartes: cards }) => cards.filter(isRed)).filter(({ ticket }) => (seenOnes.has(ticket) ? false : (seenOnes.add(ticket), true)));
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

// Les gestes qui tranchent une carte du TODO d'un clic, chacun par son nom (vue.js les joue) : répondre d'un choix, valider
// un écran, reprendre une carte de WAITING ou dire arrivé ce qu'elle attendait.
/** @typedef {"repondre" | "valider" | "attente-reprendre" | "attente-arrivee"} KindOfAction */
/** @typedef {{ texte: string, recommande: boolean, sorte: KindOfAction, reponse?: import("../../card-todo.ts").Answer, ouvre?: true }} ActionOfTodo */
/**
 * Ce que le TODO sait de la vue pour trancher ses cartes : où en est la réponse d'une carte (`etat`), les gestes de WAITING
 * et leurs libellés (`attente`), et de quoi jouer un geste (`jouer`).
 * @typedef {{ etat: (ticket: number, todo: import("../../card-todo.ts").CardOfTodo) => import("../card-todo.js").State, attente: readonly { id: string, libelle: string }[], jouer: (ticket: number, kind: KindOfAction, answer?: import("../../card-todo.ts").Answer) => void }} ActionsOfTodo
 */

// Les gestes de WAITING qui la tranchent : la reprendre, ou dire arrivé ce qu'elle attendait — « waiting for… » remet la
// question à plus tard, il n'y répond pas (docs/todo-cards.md).
const DECIDE = ["attente-reprendre", "attente-arrivee"];
// Pourquoi une entrée du TODO se lit sans bouton.
const READ_ONLY = "read-only: nothing is decided from here";

/**
 * Les boutons d'une carte du TODO, ceux de sa carte (ticket 4261) : « Validate » d'un écran à valider,
 * un par choix d'une question — le recommandé plein d'accent —, tant que sa réponse n'est pas partie d'ici ; ou les gestes de
 * WAITING qu'elle a. Aucun sur une carte qui ne se tranche qu'en mots : un clic sur son entrée ouvre sa carte et son champ.
 * @param {Card} card @param {ActionsOfTodo} actions @returns {ActionOfTodo[]}
 */
export function actionsOfTodo(card, actions) {
  const { todo } = card;
  if (todo === undefined) return actions.attente.filter(({ id }) => DECIDE.includes(id) && card.gestes?.includes(/** @type {never} */ (id))).map(({ id, libelle: wording }) => ({ texte: wording, recommande: false, sorte: /** @type {KindOfAction} */ (id) }));
  // Un écran à valider : son bouton, quand sa carte dit la PR qu'il tranche — sinon aucun, comme sur sa carte.
  if (isOneValidation(todo)) return "pr" in (todo.validation ?? {}) ? [{ texte: VALIDATE, recommande: true, sorte: "valider" }] : [];
  if (!["repos", "refus"].includes(seenOfTheCard(todo, actions.etat(card.ticket, todo)).vu)) return [];
  // Une carte qui ne se répond qu'en mots (`parked:chef`, #4593) : son bouton ouvre sa carte, où le chef écrit sa réponse.
  if (todo.choix.length === 0 && todo.repondre !== undefined) return [{ texte: todo.repondre, recommande: true, sorte: "repondre", ouvre: true }];
  const recommended = recommendationOf(todo)?.rang;
  return todo.choix.map(({ texte: text }, rank) => ({ texte: text, recommande: rank + 1 === recommended, sorte: "repondre", reponse: { question: todo.question, choix: rank + 1 } }));
}

/**
 * Le TODO du chef, en une ligne au-dessus des colonnes (ticket 4354) : « 2 wait for you ». Un clic montre, sous elle, une
 * entrée par ticket parked pour lui (ticket 4261) — son numéro et son titre, dont un clic ouvre sa carte ; ce qui lui est
 * demandé ; qui, jusqu'à quand ; ses boutons, qui y répondent. Les entrées sont celles du TODO parked (parked/, ticket
 * 4281), qui ajoute à chacune son contrôle de park (`control`, `opened`). `deplie` garde, d'un rendu à l'autre, que le chef
 * l'a ouvert. Sans `gestes` — un projet en lecture seule —, ses cartes se lisent sans bouton. Rien du tout quand rien ne
 * l'attend.
 * @param {Fabrique} doc @param {{ cartes: readonly Card[], ouvrir: (card: Card) => void, gestes?: ActionsOfTodo, control?: (record: import("../parked/records.js").ParkedRecord) => any, opened?: Set<number>, deplie: { ouvert: boolean } }} todo
 */
export function setTheTodo(doc, { cartes: cards, ouvrir: open, gestes: actions, control, opened, deplie: unfolded }) {
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
      ...(actions === undefined ? { readOnly: READ_ONLY } : { control, opened }),
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

// Il y a combien de temps, en un seul ordre de grandeur : « 2 h ago ».
/** @param {number} ms */
const itYA = (ms) => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ago` : `${Math.floor(minutes / 1440)} d ago`;
};

/**
 * La bande du haut (ticket 4354) : une carte pour le supervisor, une pour le closer, sur une ligne — son nom, un point d'état
 * (au travail, au repos, en alerte) et deux ou trois mots. Un clic sur une carte déplie son détail dessous : ce qu'il fait,
 * sa dernière action et son heure ; `deplies` garde ce qui est déplié d'un rendu à l'autre. Un agent que l'équipe lue montre
 * déjà (autonomy/team.js, `montre`) n'a pas de carte ici : son badge est la sienne. `alerte` : l'issue que la cuisine a
 * ouverte sur elle-même, que le supervisor dit. Le message du haut, s'il y en a un, se pose juste dessous (vue.js).
 * @param {Fabrique} doc
 * @param {{ roles: readonly RoleOfKitchen[] | undefined, montre: (name: string) => boolean, alerte: number | undefined, maintenant: number, deplies: Set<string> }} bande
 */
export function setTheBandOfTop(doc, { roles, montre: shows, alerte: alert, maintenant: now, deplies: unfoldedOnes }) {
  const frame = doc.createElement("div");
  frame.className = "bande-du-haut";
  const line = doc.createElement("div");
  line.className = "cartes-des-agents";
  frame.append(line);
  const role = (/** @type {string} */ name) => roles?.find((oneOf) => oneOf.role === name);
  /** @param {string} name @param {string} your @param {string} words */
  const card = (name, your, words) => {
    const it = role(name);
    const latest = it?.latest ?? null;
    const detail = doc.createElement("p");
    detail.className = "detail-de-l-agent";
    detail.dataset.agent = name;
    detail.textContent = [it?.does, latest === null ? NOT_STILL("action") : `last: ${latest.what} · ${hourUtc(latest.at)}`].filter(Boolean).join(" · ");
    const setOne = button(
      doc,
      "",
      () => {
        if (unfoldedOnes.delete(name)) detail.remove();
        else {
          unfoldedOnes.add(name);
          frame.append(detail);
        }
        setOne.ariaExpanded = String(unfoldedOnes.has(name));
      },
      { sorte: "discret" },
    );
    setOne.className += " carte-d-agent";
    setOne.dataset.agent = name;
    setOne.ariaExpanded = String(unfoldedOnes.has(name));
    setOne.replaceChildren(brand(doc, your), Object.assign(doc.createElement("strong"), { textContent: name }), Object.assign(doc.createElement("span"), { textContent: words }));
    line.append(setOne);
    if (unfoldedOnes.has(name)) frame.append(detail);
  };
  if (!shows("supervisor")) card("supervisor", alert === undefined ? "gris" : "rouge", alert === undefined ? "ok" : `alert: #${alert}`);
  const cleanup = role("closer")?.latest ?? null;
  if (!shows("closer")) card("closer", "gris", cleanup === null ? NOT_STILL("tidy") : `tidied ${itYA(now - Date.parse(cleanup.at))}`);
  return frame;
}

// Un message porte un geste : un bouton, à lui ou à ce qui le suit.
/** @param {readonly any[]} message */
export const aOneAction = (message) => message.some((element) => element.querySelectorAll("button").length > 0);

