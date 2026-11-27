// @ts-check
// La visite d'une vraie cuisine (ticket 4087, épique 4086 ; née visite guidée du premier lancement, ticket 3165). Offerte, jamais
// imposée : l'écran d'accueil la propose à côté de « add my project » (home/choice/choice.js), et l'entrée « ? » de la barre
// la rejoue. Elle montre la cuisine de Brigade elle-même, benomite/brigade, en lecture seule : son rail lu sur GitHub par
// des lectures seules (visit.ts, côté process principal) — rien n'est cloné, aucun projet n'est ajouté, rien n'est écrit
// dans ~/Brigade. La lecture seule tient à la visite, pas aux droits du compte : même un compte qui peut écrire dans
// benomite/brigade n'y voit aucun geste sur un ticket. Par-dessus, la bulle de la visite guidée : six étapes, dans
// l'ordre — le rail et ses colonnes, une carte en cuisson, la pass qui juge une livraison, un ticket servi, TODO et ce
// qu'une carte demande, le second. Chaque étape désigne un élément de l'écran (`trouverLaCible`, `marquerLaCible`) et dit
// en une ou deux phrases ce que le nouveau venu voit, avec le mot de Brigade (docs/glossary.md). Quand le moment n'a rien
// à montrer — aucun cook en cours, rien en pass —, l'étape le dit et montre le dernier exemple à la place : le dernier
// ticket servi, la dernière livraison jugée. « leave the visit », en tête, ramène à l'écran d'accueil à toute étape ; la
// dernière finit sur un seul geste : « add my project ».
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { actions } from "../journey-project/connection.js";
import { READ_OF } from "../lexicon.js";
import { LIST_OF_CHEF, columnOf } from "../todo/todo.js";
import { ADD_THE_MINE } from "../home/choice/choice.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../facts.ts").Column} Column */
/** @typedef {Pick<Column, "nom" | "cartes" | "autres">} ColumnRead */
// Ce que l'étape désigne : une colonne du rail, une carte de cette colonne, le rail entier, l'entrée « TODO (N) », ou le second.
/** @typedef {{ colonne?: string, ticket?: number, todo?: true, second?: true }} Target */
// `mot` : le mot de Brigade pour ce qui est montré, en titre. `exemple` : le moment n'a rien à montrer, l'étape montre
// le dernier exemple à la place.
/** @typedef {{ cle: string, mot: string, texte: string, cible: Target, exemple?: true }} Step */
/** @typedef {{ rang: number }} VisitInProgress */
/** @typedef {{ suivante: () => void, ajouter: () => void }} ActionsOfTheVisit */
// Ce que le process principal a lu de la cuisine visitée (visit.ts) : son tableau, ou pourquoi il ne s'est pas lu.
/** @typedef {import("../../visit.ts").KitchenVisited} KitchenVisited */
/** @typedef {{ quitter: () => void, relire: () => void }} ActionsOfTheKitchen */

// La cuisine visitée : celle de Brigade, cuisinée chaque jour en public. Le process principal (visit.ts) ne lit qu'elle.
export const REPOSITORY_OF_THE_VISIT = "benomite/brigade";

// Les colonnes du rail, telles que facts.ts les nomme.
const TAKEN = "Taken";
const PASS = "Pass";
const SERVED = "Served";

export const TITLE_OF_THE_VISIT = "Tour of a real kitchen";
/** @param {number} rank @param {number} total */
export const RANK = (rank, total) => `${TITLE_OF_THE_VISIT} · ${rank} of ${total}`;
export const NEXT = "Next";
const QUIT = "leave the visit";
export const QUIT_HOVER = "Back to the welcome screen. Nothing was added or cloned.";
export const ADD_THE_ITS_OWN = ADD_THE_MINE;
export const REPLAY = "Replay the visit";
export const TITLE_OF_THE_KITCHEN = "Brigade's own kitchen";
const READ_ONLY = "Read-only: you watch the kitchen cook, nothing here acts on its tickets.";
const SECOND_OF_THE_VISIT = "Your second opens with your own project.";
const KITCHEN_UNREADABLE = "Brigade's kitchen cannot be read right now.";
const REREAD = "read again";
export const READ_OF_RAIL = READ_OF("the rail");

export const WORD_RAIL = "The rail";
export const WORD_COOK = "A cook";
export const WORD_PASS = "The pass";
export const WORD_SERVED = "Served";
export const WORD_TODO = "TODO";
export const WORD_SECOND = "The second";

/** @param {string[]} columns */
export const TEXT_RAIL = (columns) => `This is the rail: every ticket the kitchen serves, one column per step — ${columns.join(", ")}. A ticket moves from left to right as it is cooked, judged and served.`;
/** @param {number} ticket */
export const COOK_IN_PROGRESS = (ticket) => `#${ticket} is taken: a cook, a claude session in its own worktree, is cooking it right now. When it is done, the cook hands over its delivery as a pull request.`;
/** @param {number} ticket */
export const COOK_EXAMPLE = (ticket) => `No cook is running right now. Here is the last served ticket instead, #${ticket}: a cook took it, cooked it and handed over its delivery.`;
export const COOK_WITHOUT_EXAMPLE = "No cook is running right now, and no ticket was served in the last 24 h to show instead. When a cook takes a ticket, its card sits in Taken while it cooks.";
/** @param {number} ticket */
export const PASS_IN_PROGRESS = (ticket) => `#${ticket} is in the pass: the pass is judging its delivery — gates, CI, an independent review — before it is merged.`;
/** @param {number} ticket */
export const PASS_EXAMPLE = (ticket) => `Nothing is in the pass right now. Here is the last delivery it judged instead, #${ticket}: the pass let it through, and it was merged.`;
export const PASS_WITHOUT_EXAMPLE = "Nothing is in the pass right now, and no delivery was judged in the last 24 h to show instead. A delivery sits in Pass while the pass judges it.";
/** @param {number} ticket */
export const SERVED_STEP = (ticket) => `#${ticket} is served: the pass judged its delivery and merged it. Served keeps the tickets of the last 24 h.`;
export const SERVED_WITHOUT_EXAMPLE = "No ticket was served in the last 24 h. A ticket lands in Served once the pass has merged its delivery.";
/** @param {number} ticket */
export const TODO_IN_PROGRESS = (ticket) => `#${ticket} awaits a human: its card turns red in the column of its step, counted by the TODO, and asks one question only a human can answer — a product choice, a design choice or a review. The answer is given on the card, and the kitchen goes on.`;
export const TODO_EMPTY = "Nothing awaits a human right now. When the kitchen needs a decision only a human can make, the ticket's card turns red in the column of its step, counted by the TODO, and asks it.";
export const TEXT_SECOND = "This is the second: your product assistant for this project, a claude session at your side. Ask it what you see on the rail, or to write a ticket with you.";

/** @param {ColumnRead[]} columns @param {string} name */
const cardsOf = (columns, name) => columns.find((column) => column.nom === name)?.cartes ?? [];

// Les six étapes, d'après les colonnes que le rail montre en ce moment. Absentes, le rail n'est pas encore lu : les étapes
// qui ont besoin d'un exemple le disent, et se reposent à la lecture suivante.
/** @param {ColumnRead[] | undefined} columns @returns {Step[]} */
export function stepsOfTheVisit(columns) {
  const rail = { cle: "rail", mot: WORD_RAIL, cible: {} };
  const second = { cle: "second", mot: WORD_SECOND, texte: TEXT_SECOND, cible: { second: /** @type {true} */ (true) } };
  if (columns === undefined) {
    return [
      { ...rail, texte: READ_OF_RAIL },
      { cle: "cook", mot: WORD_COOK, texte: READ_OF_RAIL, cible: { colonne: TAKEN } },
      { cle: "pass", mot: WORD_PASS, texte: READ_OF_RAIL, cible: { colonne: PASS } },
      { cle: "served", mot: WORD_SERVED, texte: READ_OF_RAIL, cible: { colonne: SERVED } },
      { cle: "todo", mot: WORD_TODO, texte: READ_OF_RAIL, cible: { todo: true } },
      second,
    ];
  }
  // Le dernier servi d'abord : Served tient ses cartes de la plus récente à la plus ancienne (rail/github.ts).
  const [lastServed] = cardsOf(columns, SERVED);
  /** @param {string} column @param {(ticket: number) => string} inProgress @param {(ticket: number) => string} example @param {string} withoutExample */
  const alive = (column, inProgress, example, withoutExample) => {
    const [card] = cardsOf(columns, column);
    if (card !== undefined) return { texte: inProgress(card.ticket), cible: { colonne: column, ticket: card.ticket } };
    if (lastServed !== undefined) return { texte: example(lastServed.ticket), cible: { colonne: SERVED, ticket: lastServed.ticket }, exemple: /** @type {true} */ (true) };
    return { texte: withoutExample, cible: { colonne: column } };
  };
  // TODO n'est pas une colonne (ticket 3458) : l'écran montre les colonnes des étapes, et la liste de ce qui attend le chef
  // en pose les cartes, rouges, dans la colonne de leur étape. Les cartes du chef d'abord, puis celles qui attendent un
  // autre humain du projet (ticket 2985), repliées à côté de l'entrée « TODO (N) ».
  const steps = columns.filter(({ nom: name }) => name !== LIST_OF_CHEF).map(({ nom: name }) => name);
  const todo = columns.find(({ nom: name }) => name === LIST_OF_CHEF);
  const [red] = todo?.cartes ?? [];
  const [ofOthers] = todo?.autres ?? [];
  /** @type {Target} */
  const targetTodo = red !== undefined ? { colonne: columnOf(red, steps), ticket: red.ticket } : ofOthers !== undefined ? { todo: true, ticket: ofOthers.ticket } : { todo: true };
  const question = red ?? ofOthers;
  return [
    { ...rail, texte: TEXT_RAIL(steps) },
    { cle: "cook", mot: WORD_COOK, ...alive(TAKEN, COOK_IN_PROGRESS, COOK_EXAMPLE, COOK_WITHOUT_EXAMPLE) },
    { cle: "pass", mot: WORD_PASS, ...alive(PASS, PASS_IN_PROGRESS, PASS_EXAMPLE, PASS_WITHOUT_EXAMPLE) },
    { cle: "served", mot: WORD_SERVED, ...(lastServed === undefined ? { texte: SERVED_WITHOUT_EXAMPLE, cible: { colonne: SERVED } } : { texte: SERVED_STEP(lastServed.ticket), cible: { colonne: SERVED, ticket: lastServed.ticket } }) },
    { cle: "todo", mot: WORD_TODO, texte: question === undefined ? TODO_EMPTY : TODO_IN_PROGRESS(question.ticket), cible: targetTodo },
    second,
  ];
}

/** @param {any} root @returns {any[]} */
function descendants(root) {
  return [...(root?.children ?? [])].flatMap((child) => [child, ...descendants(child)]);
}

// L'élément vivant que l'étape désigne, dans le rail tel qu'il est posé : la carte (`data-ticket`) dans sa colonne
// (`data-colonne`) ou à côté de l'entrée « TODO (N) », sinon sa colonne ou cette entrée, sinon la rangée des colonnes, sinon
// le rail. Le second, c'est sa colonne.
/** @param {{ rail: any, second: any }} ecran @param {Target} target @returns {any} */
export function findTheTarget({ rail, second }, target) {
  if (target.second === true) return second;
  const poses = descendants(rail);
  const row = poses.find((pose) => String(pose.className ?? "").split(" ").includes("colonnes")) ?? rail;
  const todo = target.todo === true ? poses.find((pose) => String(pose.className ?? "").split(" ").includes("todo-du-rail")) : undefined;
  if (target.colonne === undefined && todo === undefined) return row;
  const column = todo ?? poses.find((pose) => pose.dataset?.colonne === target.colonne);
  if (column === undefined) return row;
  if (target.ticket === undefined) return column;
  return descendants(column).find((pose) => pose.dataset?.ticket === String(target.ticket)) ?? column;
}

// L'élément désigné porte `data-visite` — la feuille l'entoure de l'accent — et vient en vue ; le précédent le perd.
/** @returns {(target: any) => void} */
export function markerOfTarget() {
  /** @type {any} */
  let marked;
  return (target) => {
    if (marked !== undefined && marked !== target) delete marked.dataset.visite;
    marked = target;
    if (target === undefined) return;
    target.dataset.visite = "";
    target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
}

// La bulle de l'étape : où on en est, le mot de Brigade, ce que le nouveau venu voit ; puis le geste qui avance — à la
// dernière, le seul appel à agir, « add my project ». De quoi quitter la visite est en tête de son écran, à chaque étape.
/** @param {Fabrique} doc @param {{ etapes: Step[], rang: number }} etat @param {ActionsOfTheVisit} action */
export function setVisit(doc, { etapes: steps, rang: rank }, action) {
  const step = steps[rank] ?? steps[0];
  const last = rank >= steps.length - 1;
  const root = doc.createElement("div");
  root.className = "visite";
  root.role = "dialog";
  root.ariaLabel = TITLE_OF_THE_VISIT;
  root.dataset.etape = step?.cle ?? "";
  if (step?.exemple === true) root.dataset.exemple = "";
  const or = doc.createElement("p");
  or.className = "rang";
  or.textContent = RANK(rank + 1, steps.length);
  const word = doc.createElement("h3");
  word.textContent = step?.mot ?? "";
  const said = doc.createElement("p");
  said.className = "dit";
  said.textContent = step?.texte ?? "";
  root.append(
    or,
    word,
    said,
    actions(doc, [last ? buttonAction(doc, ADD_THE_ITS_OWN, action.ajouter, { recommande: true }) : buttonAction(doc, NEXT, action.suivante, { recommande: true })]),
  );
  return root;
}

// Une carte de la cuisine visitée : son numéro, son titre, son état — à lire, sans geste. `attente` : elle attend un humain
// de la cuisine, rouge dans la colonne de son étape, comme sur le rail (ticket 3458).
/** @param {Fabrique} doc @param {import("../../facts.ts").Card} card @param {boolean} wait */
function cardVisited(doc, card, wait) {
  const li = doc.createElement("li");
  li.className = "carte-visitee";
  li.dataset.ticket = String(card.ticket);
  if (wait) li.dataset.carte = "attente";
  const number = doc.createElement("span");
  number.className = "numero-visite mono";
  number.textContent = `#${card.ticket}`;
  li.append(number);
  if (card.mot !== undefined && card.mot !== "") {
    const word = doc.createElement("span");
    word.className = "mot-visite";
    if (card.ton !== undefined) word.dataset.ton = card.ton;
    word.textContent = card.mot;
    li.append(word);
  }
  const title = doc.createElement("p");
  title.className = "titre-visite";
  title.textContent = card.titre ?? "";
  li.append(title);
  return li;
}

// Le rail de la cuisine visitée, tel que l'écran d'un projet le range : une colonne par étape (`data-colonne`), une carte
// par ticket (`data-ticket`). TODO n'est pas une colonne (ticket 3458) : ses cartes viennent en tête de la colonne de leur
// étape.
/** @param {Fabrique} doc @param {ColumnRead[]} columns */
function columnsVisited(doc, columns) {
  const row = doc.createElement("div");
  row.className = "colonnes";
  const steps = columns.filter(({ nom: name }) => name !== LIST_OF_CHEF);
  const red = columns.find(({ nom: name }) => name === LIST_OF_CHEF)?.cartes ?? [];
  const names = steps.map(({ nom: name }) => name);
  for (const column of steps) {
    const section = doc.createElement("section");
    section.className = "colonne";
    section.dataset.colonne = column.nom;
    const head = doc.createElement("h4");
    const name = doc.createElement("span");
    name.textContent = column.nom;
    const come = red.filter((card) => columnOf(card, names) === column.nom);
    const account = doc.createElement("span");
    account.textContent = String(come.length + column.cartes.length);
    head.append(name, account);
    section.append(head);
    if (come.length + column.cartes.length === 0) {
      const empty = doc.createElement("p");
      empty.textContent = /** @type {{ vide?: string }} */ (column).vide ?? "";
      section.append(empty);
    } else {
      const list = doc.createElement("ol");
      list.append(...come.map((card) => cardVisited(doc, card, true)), ...column.cartes.map((card) => cardVisited(doc, card, false)));
      section.append(list);
    }
    row.append(section);
  }
  return row;
}

// L'écran de la visite : en tête, la cuisine visitée, la ligne qui la dit en lecture seule et « leave the visit » ; dessous,
// son rail — en lecture, lu, ou pourquoi il ne se lit pas, avec « read again » — et, à côté, la colonne du second, que
// la visite n'ouvre pas. Aucun geste sur un ticket : ni créer, ni déplacer, ni commenter, ni fermer, ni lancer. Rend
// l'écran, et ses deux éléments que les étapes désignent.
/** @param {Fabrique} doc @param {KitchenVisited | undefined} readEntry @param {ActionsOfTheKitchen} action */
export function setTheKitchenVisited(doc, readEntry, action) {
  const root = doc.createElement("div");
  root.className = "cuisine-visitee";
  const head = doc.createElement("header");
  head.className = "tete-de-la-visite";
  const title = doc.createElement("h2");
  title.textContent = TITLE_OF_THE_KITCHEN;
  const repository = doc.createElement("span");
  repository.className = "mono";
  repository.textContent = REPOSITORY_OF_THE_VISIT;
  const only = doc.createElement("p");
  only.className = "lecture-seule-de-la-visite";
  only.textContent = READ_ONLY;
  const quit = button(doc, QUIT, action.quitter);
  quit.title = QUIT_HOVER;
  quit.dataset.geste = "quitter-la-visite";
  head.append(title, repository, only, quit);
  const rail = doc.createElement("section");
  rail.className = "rail-de-la-visite";
  rail.ariaLabel = "The rail";
  if (readEntry === undefined) {
    const reading = doc.createElement("p");
    reading.className = "lecture";
    reading.textContent = READ_OF_RAIL;
    rail.append(reading);
  } else if ("tableau" in readEntry) {
    rail.append(columnsVisited(doc, readEntry.tableau.rail.colonnes));
  } else {
    rail.append(lineError(doc, KITCHEN_UNREADABLE, readEntry.sans), actions(doc, [buttonAction(doc, REREAD, action.relire, { recommande: true })]));
  }
  const second = doc.createElement("aside");
  second.className = "second-de-la-visite";
  const word = doc.createElement("h4");
  word.textContent = WORD_SECOND;
  const said = doc.createElement("p");
  said.textContent = SECOND_OF_THE_VISIT;
  second.append(word, said);
  const body = doc.createElement("div");
  body.className = "corps-de-la-visite";
  body.append(rail, second);
  root.append(head, body);
  return { racine: root, rail, second };
}

// La visite tenue pour la vue : en cours ou non, et son étape. Rien n'en est gardé : elle ne démarre jamais d'elle-même,
// seulement du choix de l'écran d'accueil ou de l'entrée qui la rejoue, et repart alors de sa première étape.
/** @param {{ rendre: () => void }} options */
export function holdTheVisit({ rendre: render }) {
  /** @type {VisitInProgress | undefined} */
  let inProgress;
  return {
    get etat() {
      return inProgress;
    },
    commencer() {
      inProgress = { rang: 0 };
      render();
    },
    /** @param {number} total */
    suivante(total) {
      if (inProgress === undefined) return;
      inProgress = { rang: Math.min(inProgress.rang + 1, total - 1) };
      render();
    },
    quitter() {
      inProgress = undefined;
      render();
    },
  };
}
