// @ts-check
// Le ticket sensible dans l'app (ticket 3224, épique 3214 ; docs/sensitive-tickets.md) :
//   - sa carte du rail porte la marque « sensitive », en tête de ses étiquettes (`marquerSensible`) — une carte sans le
//     label ne la porte pas ;
//   - sa livraison verte, que la pass ne merge pas, attend dans TODO sur la carte « review before merge » (runtime/src/
//     sensible/, ticket 3223). Dans cet ordre : la question ; le lien de la pull request, qui l'ouvre d'un clic ; « Merge »,
//     le geste recommandé ; puis le champ de la note et « Send back », éteint tant que la note est vide. Deux réponses, pas
//     une de plus. Le prix de chaque geste est au survol. Chaque geste part par le pont : le process principal joue la
//     commande `sensitive` du runtime (card-sensitive-github.ts, `jouerLaRevue`) ; fait, la carte quitte TODO ; refusé, elle
//     reste, et dit pourquoi en une ligne, le détail au survol.
// La carte reprend les briques de la carte « Validate its screen » (validation-design/) : la carte de réponse, le bouton, la
// ligne d'erreur, l'étape d'un geste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément et ce que chaque geste appelle, et rend un élément.

import { buttonAction } from "../bricks.js";
import { button } from "../components/button/button.js";
import { cardOfAnswer } from "../components/card-wait/card-wait.js";
import { lineError } from "../components/line-error/line-error.js";
import { rowOfSecond } from "../todo-card/ask-at-second.js";
import { PR_OF_TICKET } from "../pr-of-ticket.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../card-todo.ts").CardOfTodo} CardOfTodo */
/** @typedef {import("./card-sensitive-github.ts").ActionSensitive} ActionSensitive */

// Le geste en route depuis cette vue, pour une carte.
//   repos   rien n'est parti d'ici
//   envoi   un geste part : les boutons et le champ attendent
//   refus   rien n'a été fait (`dit`, et `detail` au survol) : la carte reste, ses gestes aussi
//   fait    le runtime l'a fait : la carte quitte TODO
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", geste: ActionSensitive["geste"] }
 *   | { etape: "refus", dit: string, detail: string }
 *   | { etape: "fait", dit: string, geste?: ActionSensitive["geste"] }} State
 */

/** @type {State} */
export const REPOS = { etape: "repos" };

// Les mots du glossaire (docs/glossary.md) : `sensitive`, `review before merge`.
export const BRAND = "sensitive";
export const HOVER_OF_THE_BRAND = "this ticket is labelled sensitive: once judged green, its delivery waits for your review before merge";
export const MERGER = "Merge";
export const SEND_BACK = "Send back";
export const FIELD = "Note: what to change — required to send back";
export const EN_MERGE = "merging…";
export const EN_SEND_BACK = "sending back…";
// Le geste fait : le bouton cliqué le dit, au lieu de disparaître sans un mot (ticket 3386).
export const MERGE = "merged ✓";
export const SENT_BACK = "sent back ✓";
// Le temps que la carte garde sa confirmation avant de quitter TODO.
export const CONFIRMATION_MS = 1200;
// Le champ de la note, tel que la vue le reconnaît pour lui rendre le clavier quand la page est reposée.
export const FIELD_OF_THE_NOTE = "note-sensible";
// La PR se dit par son ticket (pr-of-ticket.js, ticket 3716) ; son lien ouvre la PR.
/** @param {number} ticket */
export const LINK = (ticket) => PR_OF_TICKET(ticket);
/** @param {number} ticket */
export const PRICE_MERGER = (ticket) => `The ${PR_OF_TICKET(ticket)} is merged into the integration branch from your GitHub account, and the card is closed — a merge is not undone from the app`;
/** @param {number} ticket */
export const PRICE_SEND_BACK = (ticket) => `your note is posted on #${ticket} as what to change, and the card is closed: a cook takes the ticket up again — it may be launched on the project's quota`;
export const WITHOUT_BRIDGE = "nothing was done: this app does not play the kitchen's command — answer this card from the desktop app";

// La marque « sensitive » en tête des étiquettes d'une carte du rail (labels-of-slip.js) : posées sur la ligne qu'elles
// ont déjà, ou sur une ligne à elle si la carte n'en a pas.
/** @param {Fabrique} doc @param {any | null} labels */
export function markSensitive(doc, labels) {
  const brand = doc.createElement("span");
  brand.className = "etiquette etiquette-sensible";
  brand.textContent = BRAND;
  brand.title = HOVER_OF_THE_BRAND;
  const line = labels ?? doc.createElement("span");
  if (labels === null) line.className = "etiquettes";
  line.prepend(brand);
  return line;
}

// L'étape qui suit ce que le process principal a rendu.
/** @param {import("./card-sensitive-github.ts").RenderedSensitive | undefined} rendered @returns {State} */
export function afterRendered(rendered) {
  if (rendered === undefined) return { etape: "refus", dit: "nothing was done: this project is not known to the app", detail: "" };
  if ("refus" in rendered) return { etape: "refus", dit: rendered.refus, detail: rendered.detail };
  return { etape: "fait", dit: rendered.fait };
}

// Une carte « review before merge » : celle dont la carte de TODO porte `revue`.
/** @param {CardOfTodo | undefined} todo */
export const isOneReview = (todo) => todo?.revue !== undefined;

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [text] */
function created(doc, balise, classe, text) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La carte, dans son état. `note` : ce que le chef a déjà tapé ; `cle` marque le champ. `lectureSeule` : le projet est en
// lecture seule — la carte se lit, rien ne la tranche d'ici. `grand` : à la largeur d'un téléphone, les boutons en 44 px.
// `second` : dans TODO, la carte finit par « ask the second », comme toute carte de TODO (ticket 3133) ; `demander` la passe
// au second.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CardOfTodo} card
 * @param {State} state
 * @param {{ note: string, cle: string, lectureSeule?: boolean, grand?: boolean, second?: { envoi: true } | { parti: string } | { refus: string } }} posees
 * @param {{ merger: () => void, renvoyer: (note: string) => void, ecrire: (text: string) => void, ouvrirPr: () => void, demander?: () => void }} actions
 */
export function setCardSensitive(doc, ticket, card, state, { note, cle: key, lectureSeule: readOnly = false, grand = false, second }, actions) {
  const root = cardOfAnswer(doc, { sorte: card.sorte });
  root.className = `${root.className} carte-sensible`;
  root.ariaLabel = `the sensitive ticket #${ticket} waits for your review before merge`;
  const { revue: review } = card;
  if (card.question !== null) root.append(created(doc, "p", "question-carte", card.question));
  if (review === undefined || "illisible" in review) {
    root.append(created(doc, "p", "revue-illisible", review?.illisible ?? "this card does not say which pull request it holds"));
  } else {
    const link = button(doc, LINK(review.ticket), actions.ouvrirPr, { sorte: "discret" });
    link.className = `${link.className} lien-de-la-pr`.trim();
    link.title = "opens the pull request on GitHub";
    root.append(link);
    if (!readOnly) root.append(...setTheAnswers(doc, review, state, { note, cle: key, grand }, actions));
  }
  if (actions.demander !== undefined) root.append(rowOfSecond(doc, ticket, second, actions.demander));
  return [root];
}

// Les deux réponses : « Merge », puis la note et « Send back » — puis, s'il y a lieu, le geste en route ou ce qui l'a refusé.
/**
 * @param {Fabrique} doc @param {{ pr: number, ticket: number }} review @param {State} state
 * @param {{ note: string, cle: string, grand: boolean }} posees
 * @param {{ merger: () => void, renvoyer: (note: string) => void, ecrire: (text: string) => void }} actions
 */
function setTheAnswers(doc, review, state, { note, cle: key, grand }, actions) {
  const enRoute = state.etape === "envoi";
  const done = state.etape === "fait";
  const action = state.etape === "envoi" || state.etape === "fait" ? state.geste : undefined;
  const said = (/** @type {ActionSensitive["geste"]} */ which, /** @type {string} */ wording) =>
    action !== which ? wording : enRoute ? (which === "merger" ? EN_MERGE : EN_SEND_BACK) : done ? (which === "merger" ? MERGE : SENT_BACK) : wording;
  const merger = buttonAction(doc, said("merger", MERGER), actions.merger, { recommande: true, grand, prix: PRICE_MERGER(review.ticket) });
  const buttonMerger = merger.children?.[0];
  if (buttonMerger !== undefined) buttonMerger.disabled = enRoute || done;

  const sentence = created(doc, "div", "phrase renvoi");
  const input = created(doc, "textarea");
  input.value = note;
  input.rows = 2;
  input.placeholder = FIELD;
  input.ariaLabel = `the note sending #${review.ticket} back: what to change`;
  input.required = true;
  input.disabled = enRoute || done;
  input.dataset.cle = key;
  input.dataset.champ = FIELD_OF_THE_NOTE;
  const sendBack = buttonAction(doc, said("renvoyer", SEND_BACK), () => {
    if (input.value.trim() !== "") actions.renvoyer(input.value);
  }, { grand, prix: PRICE_SEND_BACK(review.ticket) });
  const buttonSendBack = sendBack.children?.[0];
  if (buttonSendBack !== undefined) buttonSendBack.disabled = enRoute || done || note.trim() === "";
  input.addEventListener("input", () => {
    actions.ecrire(input.value);
    if (buttonSendBack !== undefined) buttonSendBack.disabled = input.value.trim() === "";
  });
  sentence.append(input, sendBack);
  return [
    merger,
    sentence,
    ...(enRoute ? [created(doc, "span", "en-route", state.geste === "merger" ? EN_MERGE : EN_SEND_BACK)] : []),
    ...(state.etape === "refus" ? [lineError(doc, state.dit, state.detail, { classe: "refus" })] : []),
  ];
}
