// @ts-check
// La carte « Validate its screen » (ticket 3185, épique 3180) : une livraison design verte que la pass retient pour le chef
// (ticket 3184). Dans TODO comme sur le téléphone, la même carte, dans cet ordre : la question ; les captures avant et après de
// chaque écran, l'une sous l'autre, lues sans un clic ; le lien de la pull request ; « Validate », le geste recommandé ; puis
// le champ du commentaire et « Send back to the kitchen », éteint tant que le commentaire est vide. Le prix de chaque geste
// est au survol. Chaque geste part par le pont : sur le desktop, le process principal joue la commande du runtime
// (validation-design-github.ts, `jouerLaValidation`) ; sur le téléphone, il s'écrit sur GitHub (`validerSurGithub`) ; fait, la carte quitte TODO (`sansLesValidees`) ; refusé, elle reste,
// et dit pourquoi en une ligne, le détail au survol.
// Un clic sur la carte, ou sur l'une de ses captures, l'ouvre en grand : detail-of-validation.js (ticket 3212), qui reprend ses
// deux gestes (`poserLesGestes`).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, les captures déjà posées et ce que chaque geste
// appelle, et rend un élément.

import { buttonAction } from "../bricks.js";
import { button } from "../components/button/button.js";
import { cardOfAnswer } from "../components/card-wait/card-wait.js";
import { lineError } from "../components/line-error/line-error.js";
import { rowOfSecond } from "../todo-card/ask-at-second.js";
import { PR_OF_TICKET } from "../pr-of-ticket.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../card-todo.ts").CardOfTodo} CardOfTodo */
/** @typedef {import("./validation-design-github.ts").ActionOfValidation} ActionOfValidation */
/** @typedef {import("./validation-design-github.ts").RenderedOfValidation} RenderedOfValidation */

// Le geste en route depuis cette vue, pour une carte.
//   repos   rien n'est parti d'ici
//   envoi   un geste part : les boutons et le champ attendent
//   refus   rien n'a été fait (`dit`, et `detail` au survol) : la carte reste, ses gestes aussi
//   fait    le runtime l'a fait (`geste`) : la carte dit ce qui a été fait, un court moment, puis quitte TODO
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", geste: ActionOfValidation["geste"] }
 *   | { etape: "refus", dit: string, detail: string }
 *   | { etape: "fait", dit: string, geste?: ActionOfValidation["geste"] }} State
 */

/** @type {State} */
export const REPOS = { etape: "repos" };

export const VALIDATE = "Validate";
export const SEND_BACK = "Send back to the kitchen";
export const FIELD = "What to change on the screen";
export const EN_VALIDATION = "validating…";
export const EN_SEND_BACK = "sending back to the kitchen…";
// Le geste fait : le bouton cliqué le dit, au lieu de disparaître sans un mot (ticket 3386).
export const VALID = "validated ✓";
export const SENT_BACK = "back to the kitchen ✓";
// Le temps que la carte garde sa confirmation avant de quitter TODO.
export const CONFIRMATION_MS = 1200;
// Le champ du commentaire, tel que la vue le reconnaît pour lui rendre le clavier quand la page est reposée.
export const FIELD_OF_COMMENT = "commentaire-validation";
// La PR se dit par son ticket (pr-of-ticket.js, ticket 3716) ; son lien ouvre la PR.
/** @param {number} ticket */
export const LINK = (ticket) => PR_OF_TICKET(ticket);
/** @param {number} ticket */
export const PRICE_VALIDATE = (ticket) => `The ${PR_OF_TICKET(ticket)} is merged into the integration branch from your GitHub account, and the card is closed — a merge is not undone from the app`;
/** @param {number} ticket */
export const PRICE_SEND_BACK = (ticket) => `your comment is posted on #${ticket} as what to change, and the card is closed: a cook takes the ticket up again — it may be launched on the project's quota`;

// L'étape qui suit ce que le process principal a rendu.
/** @param {RenderedOfValidation | undefined} rendered @returns {State} */
export function afterRendered(rendered) {
  if (rendered === undefined) return { etape: "refus", dit: "nothing was done: this project is not known to the app", detail: "" };
  if ("refus" in rendered) return { etape: "refus", dit: rendered.refus, detail: rendered.detail };
  return { etape: "fait", dit: rendered.fait };
}

// Une carte « Validate its screen » : celle dont la carte de TODO porte `validation`.
/** @param {CardOfTodo | undefined} todo */
export const isOneValidation = (todo) => todo?.validation !== undefined;

// Les colonnes, sans les cartes que le chef vient de valider ou de renvoyer (`faites`, leurs numéros) : elles quittent TODO
// tout de suite, sans attendre que la lecture suivante ne les porte plus. Le compte d'une colonne suit ses cartes.
/**
 * @template {{ compte: string, cartes: { ticket: number }[], autres?: { ticket: number }[] }} C
 * @param {C[]} columns @param {ReadonlySet<number>} done @returns {C[]}
 */
export function withoutTheValidated(columns, done) {
  if (done.size === 0) return columns;
  return columns.map((column) => {
    const cards = column.cartes.filter(({ ticket }) => !done.has(ticket));
    const others = column.autres?.filter(({ ticket }) => !done.has(ticket));
    if (cards.length === column.cartes.length && others?.length === column.autres?.length) return column;
    const account = column.compte === String(column.cartes.length) ? String(cards.length) : column.compte;
    return { ...column, cartes: cards, compte: account, ...(others === undefined ? {} : { autres: others }) };
  });
}

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [text] */
function created(doc, balise, classe, text) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La carte, dans son état. `captures` : celles que la vue a posées pour elle. `commentaire` : ce que le chef a déjà tapé ;
// `cle` marque le champ. `lectureSeule` : le projet est en lecture seule — la carte se lit, rien ne la tranche d'ici.
// `grand` : à la largeur d'un téléphone, les boutons en 44 px. `second` : dans TODO, la carte finit par « ask the second »,
// comme toute carte de TODO (ticket 3133) — la demande en route, ou ce qu'elle a donné ; `demander` la passe au second.
// `ouvrir` : un clic sur la carte ouvre son détail en grand (ticket 3212).
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CardOfTodo} card
 * @param {State} state
 * @param {{ captures: any[], commentaire: string, cle: string, lectureSeule?: boolean, grand?: boolean, second?: { envoi: true } | { parti: string } | { refus: string } }} posees
 * @param {{ valider: () => void, renvoyer: (comment: string) => void, ecrire: (text: string) => void, ouvrirPr: () => void, ouvrir?: () => void, demander?: () => void }} actions
 */
export function setCardOfValidation(doc, ticket, card, state, { captures, commentaire: comment, cle: key, lectureSeule: readOnly = false, grand = false, second }, actions) {
  const setOne = setTheCard(doc, ticket, card, state, { captures, commentaire: comment, cle: key, lectureSeule: readOnly, grand }, actions);
  if (actions.demander !== undefined) setOne.append(rowOfSecond(doc, ticket, second, actions.demander));
  return [setOne];
}

/**
 * @param {Fabrique} doc @param {number} ticket @param {CardOfTodo} card @param {State} state
 * @param {{ captures: any[], commentaire: string, cle: string, lectureSeule: boolean, grand: boolean }} posees
 * @param {{ valider: () => void, renvoyer: (comment: string) => void, ecrire: (text: string) => void, ouvrirPr: () => void, ouvrir?: () => void }} actions
 */
function setTheCard(doc, ticket, card, state, { captures, commentaire: comment, cle: key, lectureSeule: readOnly, grand }, actions) {
  const root = cardOfAnswer(doc, { sorte: card.sorte });
  root.className = `${root.className} carte-validation`;
  root.ariaLabel = `the screen #${ticket} asks you to validate`;
  const { validation } = card;
  if (card.question !== null) root.append(created(doc, "p", "question-carte", card.question));
  if (validation === undefined || "illisible" in validation) {
    root.append(created(doc, "p", "validation-illisible", validation?.illisible ?? "this card does not say which pull request it validates"));
    return root;
  }
  const screens = created(doc, "div", "captures-de-validation");
  screens.append(...captures);
  // Un clic sur la carte, ou sur l'une de ses captures, ouvre son détail en grand (detail-of-validation.js, ticket 3212) —
  // et non la fiche du ticket : ce qui s'y clique déjà, ses boutons et son champ, garde son geste. Au clavier, Entrée ou
  // Espace sur ses captures.
  if (actions.ouvrir !== undefined) {
    const open = actions.ouvrir;
    root.dataset.ouvrable = "";
    root.addEventListener("click", (/** @type {Event} */ event) => {
      event.stopPropagation();
      const target = /** @type {Element | null | undefined} */ (event.target);
      if (target?.closest?.("button, a, summary, input, textarea, select")) return;
      open();
    });
    screens.tabIndex = 0;
    screens.title = "opens the screens in large, to zoom on them";
    screens.addEventListener("keydown", (/** @type {KeyboardEvent} */ event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      open();
    });
  }
  const link = button(doc, LINK(validation.ticket), actions.ouvrirPr, { sorte: "discret" });
  link.className = `${link.className} lien-de-la-pr`.trim();
  link.title = "opens the pull request on GitHub";
  root.append(screens, link);
  if (readOnly) return root;

  root.append(...setTheActions(doc, validation, state, { commentaire: comment, cle: key, grand }, actions));
  return root;
}

// Les deux gestes d'une carte « Validate its screen », sur la carte comme sur son détail (detail-of-validation.js) :
// « Validate », le commentaire et « Send back to the kitchen » — puis, s'il y a lieu, le geste en route ou ce qui l'a refusé.
/**
 * @param {Fabrique} doc @param {{ pr: number, ticket: number }} validation @param {State} state
 * @param {{ commentaire: string, cle: string, grand: boolean }} posees
 * @param {{ valider: () => void, renvoyer: (comment: string) => void, ecrire: (text: string) => void }} actions
 */
export function setTheActions(doc, validation, state, { commentaire: comment, cle: key, grand }, actions) {
  const enRoute = state.etape === "envoi";
  const done = state.etape === "fait";
  const action = state.etape === "envoi" || state.etape === "fait" ? state.geste : undefined;
  const said = (/** @type {ActionOfValidation["geste"]} */ which, /** @type {string} */ wording) =>
    action !== which ? wording : enRoute ? (which === "valider" ? EN_VALIDATION : EN_SEND_BACK) : done ? (which === "valider" ? VALID : SENT_BACK) : wording;
  const validate = buttonAction(doc, said("valider", VALIDATE), actions.valider, { recommande: true, grand, prix: PRICE_VALIDATE(validation.ticket) });
  const buttonValidate = validate.children?.[0];
  if (buttonValidate !== undefined) buttonValidate.disabled = enRoute || done;

  const sentence = created(doc, "div", "phrase renvoi");
  const input = created(doc, "textarea");
  input.value = comment;
  input.rows = 2;
  input.placeholder = FIELD;
  input.ariaLabel = `what to change on the screen of #${validation.ticket}`;
  input.disabled = enRoute || done;
  input.dataset.cle = key;
  input.dataset.champ = FIELD_OF_COMMENT;
  const sendBack = buttonAction(doc, said("renvoyer", SEND_BACK), () => actions.renvoyer(input.value), { grand, prix: PRICE_SEND_BACK(validation.ticket) });
  const buttonSendBack = sendBack.children?.[0];
  if (buttonSendBack !== undefined) buttonSendBack.disabled = enRoute || done || comment.trim() === "";
  input.addEventListener("input", () => {
    actions.ecrire(input.value);
    if (buttonSendBack !== undefined) buttonSendBack.disabled = input.value.trim() === "";
  });
  sentence.append(input, sendBack);
  return [
    validate,
    sentence,
    ...(enRoute ? [created(doc, "span", "en-route", state.geste === "valider" ? EN_VALIDATION : EN_SEND_BACK)] : []),
    ...(state.etape === "refus" ? [lineError(doc, state.dit, state.detail, { classe: "refus" })] : []),
  ];
}
