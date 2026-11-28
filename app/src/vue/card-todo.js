// @ts-check
// La carte de TODO (ticket 1281, épique 1277), sur le bon d'un ticket qui t'attend, dans la forme
// unique de toute carte de TODO (épique 1764, ticket 1767), dans cet ordre : ce qui se passe, en deux
// phrases au plus ; la question ; un bouton par choix ;
// un champ pour répondre dans tes mots, avec son bouton « send » ; et, dessous, « ask the second ».
// Une carte à un seul geste — merger à la main une livraison verte — n'a rien à demander : son bouton,
// sans question. Le premier choix est la réponse recommandée, le seul bouton plein d'accent (ticket 2922) — ou celui que la
// carte d'un écart du manager recommande, avec pourquoi, et aucun quand il n'en recommande pas (ticket 3434) ; le champ
// d'une carte qui a ses choix est replié derrière « answer in my own words ». Un clic sur un choix est la réponse : rien d'autre n'est demandé, ni confirmation
// ni second clic ; son prix est au survol. Le texte part par son bouton — Entrée ne l'envoie pas.
// « Ask the second » n'est jamais un des choix ni le seul chemin : il passe la carte au second — son numéro, sa question,
// ce que son issue dit (ticket 3133) —, pour quand la carte ne se comprend pas.
//
// Répondue, la carte reste là où elle est, et dit où en est sa réponse (ticket 1841) : envoyée, en attente de
// la cuisine — la réponse rappelée, les choix et le champ retirés, le bord de la carte qui bat doucement
// comme le haut du rail pendant une lecture (ticket 1818), sans autre phrase ; puis jouée par la cuisine, ou
// pas jouée et pourquoi, ses choix rendus. Ce qu'elle en dit vient du tableau de la cuisine
// (`CarteDeTodo.envoi`, tiré de ses commentaires) : une app redémarrée relit les mêmes, et la carte ne
// redevient jamais sans réponse.
//
// Tout est rangé dans le process principal (app/src/card-todo.ts) : la carte pose. La réponse part
// par lui aussi (`rail choose` ou `rail answer` sur la box). Ce module tient le geste en route —
// `Etat` — et ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js) et ce que chaque geste appelle, et rend un élément.

import { buttonAction, priceSays, recommendationOf, hover } from "./bricks.js";
import { button as buttonOfTheFamily } from "./components/button/button.js";
import { cardOfAnswer } from "./components/card-wait/card-wait.js";
import { lineError } from "./components/line-error/line-error.js";
import { rowOfSecond } from "./todo-card/ask-at-second.js";
import { blockOfAction, actionOfTheQuestion } from "./todo-card/action.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../card-todo.ts").CardOfTodo} CardOfTodo */
/** @typedef {import("../card-todo.ts").Answer} Answer */
/** @typedef {import("../card-todo.ts").Rendered} Rendered */

// Le geste en route depuis cette vue, pour une carte.
//   repos     rien n'est parti d'ici : la carte dit ce que le tableau montre de sa dernière réponse, ou attend le chef
//   envoi     sa réponse part : les choix et le champ attendent
//   postee    sa réponse est postée sur le tableau (`commentaire`) : la carte attend la cuisine, jusqu'à ce que le
//             tableau dise ce qu'il en est de ce commentaire, ou d'un plus récent
//   refus     rien n'a été écrit (`dit`, et `detail` au survol) : la carte reste, ses gestes aussi
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", reponse: Answer }
 *   | { etape: "postee", reponse: Answer, commentaire: number }
 *   | { etape: "refus", dit: string, detail: string }} State
 */
/** @typedef {import("../card-todo.ts").SendSeen} SendSeen */
// Ce que la carte montre, de ce geste et de ce que le tableau dit.
//   attente   envoyée, en attente de la cuisine : `reponse`, la réponse dite en mots
//   jouee     la cuisine l'a jouée : `dit`, sa ligne, au survol
/**
 * @typedef {{ vu: "repos" }
 *   | { vu: "envoi" }
 *   | { vu: "attente", reponse: string }
 *   | { vu: "jouee", reponse: string, dit: string }
 *   | { vu: "refus", dit: string, detail: string }} Seen
 */

/** @type {State} */
export const REPOS = { etape: "repos" };

export const SEND = "send";
export const FIELD = "or answer in your own words";
// La carte d'un ticket que la nouvelle cuisine parque pour le chef (ticket 4474) : sa réponse, et son issue.
export const OWN_WORDS_FIELD = "your answer, in your own words";
export const ON_GITHUB = "Open on GitHub";
export const IN_ROUTE = "sending your answer…";
// Le bouton cliqué le dit à l'instant, avant que GitHub ne réponde (ticket 3386).
export const IN_ROUTE_BUTTON = "sending…";
export const QUEUED = "sent, waiting for the kitchen";
export const QUEUED_DETAIL = "your answer is posted on the ticket's issue on GitHub: the station reads it at its next tick, and answers under it";
export const PLAYED = "played by the kitchen";
export const NOT_PLAYED = "not played by the kitchen";
export const RECOMMENDED = "Recommended";
export const DETAILS = "details";
export const YOUR_ANSWER = "your answer";
// Le bouton discret qui ouvre le champ d'une carte qui a ses choix (ticket 2922).
export const IN_MY_WORDS = "answer in my own words";
// L'action secondaire de toute carte, « ask the second » : todo-card/ask-at-second.js (ticket 3133).
export { REQUEST_IN_ROUTE, ASK } from "./todo-card/ask-at-second.js";
// Le champ du texte libre, tel que la vue le reconnaît pour lui rendre le clavier quand le rail est redessiné.
export const FIELD_OF_CARD = "reponse-carte";

// L'étape qui suit la réponse du process principal : postée, la carte attend la cuisine.
/** @param {Answer} answer @param {Rendered | undefined} rendered @returns {State} */
export function afterRendered(answer, rendered) {
  if (rendered === undefined) return { etape: "refus", dit: "nothing was sent: this project has no station", detail: "" };
  if ("refus" in rendered) return { etape: "refus", dit: rendered.refus, detail: rendered.detail };
  return { etape: "postee", reponse: answer, commentaire: rendered.commentaire ?? 0 };
}

// La réponse du chef dite en mots, comme le process principal la dit (card-todo.ts, `reponseDite`).
/** @param {CardOfTodo} card @param {Answer} answer */
export const answerSaid = (card, answer) => ("choix" in answer ? (card.choix[answer.choix - 1]?.texte ?? `choice ${answer.choix}`) : answer.texte);

// Ce que le tableau dit de la dernière réponse, dans les mots de la carte.
/** @param {SendSeen} sending @returns {Seen} */
function seenOfBoard(sending) {
  if (sending.etat === "attente") return { vu: "attente", reponse: sending.reponse };
  if (sending.etat === "joue") return { vu: "jouee", reponse: sending.reponse, dit: sending.dit };
  return { vu: "refus", dit: `${NOT_PLAYED}: ${sending.raison}`, detail: sending.dit };
}

// Ce que la carte montre : le geste en route d'ici d'abord ; postée d'ici, elle attend la cuisine tant que le tableau ne
// dit rien de ce commentaire ni d'un plus récent ; sinon, ce que le tableau dit de la dernière réponse — c'est lui seul
// qu'une app redémarrée relit.
/** @param {CardOfTodo} card @param {State} state @returns {Seen} */
export function seenOfTheCard(card, state) {
  const { envoi: sending } = card;
  if (state.etape === "envoi") return { vu: "envoi" };
  if (state.etape === "refus") return { vu: "refus", dit: state.dit, detail: state.detail };
  if (state.etape === "postee") return sending !== undefined && sending.commentaire >= state.commentaire ? seenOfBoard(sending) : { vu: "attente", reponse: answerSaid(card, state.reponse) };
  return sending === undefined ? { vu: "repos" } : seenOfBoard(sending);
}

// Tout ce que la carte ne dit pas à première vue, derrière un seul pli fermé : le commentaire en entier, avec ses paragraphes.
/** @param {Fabrique} doc @param {string} text */
export function detailsOfCard(doc, text) {
  const fold = doc.createElement("details");
  fold.className = "details-carte";
  fold.append(created(doc, "summary", DETAILS));
  for (const paragraph of text.split(/\n{2,}/)) fold.append(created(doc, "p", paragraph));
  return fold;
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La carte de TODO d'un ticket, dans son état. `brouillon` : ce que le chef a déjà
// tapé ; `cle` marque le champ, pour qu'un rail redessiné lui rende le clavier. `second` : la demande
// au second de ce ticket, partie de la carte ou de sa fiche — absente, rien n'est parti. Envoyée ou
// jouée, elle ne pose plus ses choix ni son champ : la réponse rappelée, et où elle en est. `lectureSeule` : le projet est
// en lecture seule (ticket 3163) — la question se lit, ni choix ni champ ne la tranchent d'ici.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CardOfTodo} card
 * @param {State} state
 * @param {{ brouillon: string, cle: string, second?: { envoi: true } | { parti: string } | { refus: string }, lectureSeule?: boolean }} posees
 * @param {{ repondre: (answer: Answer) => void, ecrire: (text: string) => void, demander: () => void, copier?: (text: string) => Promise<unknown> | undefined, ouvrir?: () => void }} actions
 */
export function setCardOfTodo(doc, ticket, card, state, { brouillon: draft, cle: key, second, lectureSeule: readOnly = false }, actions) {
  const seenOne = seenOfTheCard(card, state);
  const inRoute = seenOne.vu === "envoi";
  const answerInRoute = state.etape === "envoi" ? state.reponse : undefined;
  const { question, resume } = card;
  const root = cardOfAnswer(doc, { sorte: card.sorte });
  if (seenOne.vu === "attente" || seenOne.vu === "jouee") root.dataset.envoi = seenOne.vu;
  root.ariaLabel = question === null ? `what #${ticket} awaits from you` : `the question #${ticket} asks you`;

  // À première vue, dans cet ordre et rien de plus (ticket 3086) : ce qui se passe, en une ligne ; la question, la plus forte ; la
  // réponse recommandée, en une ligne ; puis les boutons. Tout le reste — ce que le commentaire dit d'autre — est derrière
  // « details », fermé. Aucune question sur une carte à un seul geste.
  const head = [];
  if (resume !== undefined) {
    const said = created(doc, "p", resume);
    said.className = "resume-carte";
    head.push(said);
  }
  // Un geste du chef à faire lui-même se lit entier, avec son bouton « copy » (ticket 3132) ; toute autre question, comme avant.
  const action = actionOfTheQuestion(question);
  if (action !== null) head.push(blockOfAction(doc, action, actions.copier ?? (() => undefined)));
  else if (question !== null) {
    const setOne = created(doc, "p", question);
    setOne.className = "question-carte";
    head.push(setOne);
  }
  // La réponse recommandée, et pourquoi quand la carte le dit ; aucune quand le manager n'en recommande pas (ticket 3434).
  const recommended = recommendationOf(card);
  if (recommended !== null) {
    const advises = created(doc, "p", `${RECOMMENDED}: ${recommended.texte}${recommended.pourquoi === null ? "" : ` — ${recommended.pourquoi}`}`);
    advises.className = "recommandation-carte";
    head.push(advises);
  }
  const remains = card.contexte === undefined ? [] : [detailsOfCard(doc, card.contexte)];

  const choice = created(doc, "div");
  choice.className = "choix-carte";
  // La réponse recommandée — le premier choix (ticket 2922, maquette Project.dc.html), ou celui que la carte dit (ticket 3434) —
  // est pleine d'accent ; les autres non. Chaque libellé se lit entier, sur autant de lignes qu'il lui faut ; ce que le bouton fait est au survol, sans
  // pictogramme à déchiffrer à côté (ticket 3086).
  card.choix.forEach(({ texte: text, prix: price }, rank) => {
    const group = buttonAction(doc, answerInRoute !== undefined && "choix" in answerInRoute && answerInRoute.choix === rank + 1 ? IN_ROUTE_BUTTON : text, () => actions.repondre({ question, choix: rank + 1 }), { recommande: rank + 1 === recommended?.rang });
    const button = group.children?.[0];
    if (button !== undefined) {
      button.className = "choix";
      button.disabled = inRoute;
      const cost = priceSays(price);
      if (cost !== "") button.title = cost;
    }
    choice.append(group);
  });

  const sentence = created(doc, "div");
  sentence.className = "phrase";
  const input = created(doc, "textarea");
  input.value = draft;
  input.rows = 2;
  input.placeholder = card.repondre === undefined ? FIELD : OWN_WORDS_FIELD;
  input.ariaLabel = question === null ? `your answer to #${ticket}, in your own words` : `your answer to #${ticket}'s question, in your own words`;
  input.disabled = inRoute;
  input.dataset.cle = key;
  input.dataset.champ = FIELD_OF_CARD;
  const send = buttonAction(doc, answerInRoute !== undefined && "texte" in answerInRoute ? IN_ROUTE_BUTTON : (card.repondre ?? SEND), () => actions.repondre({ question, texte: input.value }), { prix: card.prixDuTexte });
  const button = send.children?.[0];
  if (button !== undefined) button.disabled = inRoute || draft.trim() === "";
  input.addEventListener("input", () => {
    actions.ecrire(input.value);
    if (button !== undefined) button.disabled = input.value.trim() === "";
  });
  sentence.append(input, send);
  // Une carte qui a ses choix replie son champ derrière « answer in my own words » (ticket 2922) : un clic l'ouvre et y
  // met le clavier. Sans choix, le champ est la seule réponse : il reste ouvert ; un texte déjà tapé le garde ouvert.
  const folded = card.choix.length > 0 && draft === "" && !inRoute;
  sentence.hidden = folded;
  const openTheField = buttonOfTheFamily(doc, IN_MY_WORDS, undefined, { sorte: "discret" });
  openTheField.className = "en-mes-mots";
  openTheField.hidden = !folded;
  openTheField.addEventListener("click", () => {
    sentence.hidden = false;
    openTheField.hidden = true;
    input.focus?.();
  });

  // « Open on GitHub » (ticket 4474) : l'issue du ticket, dans le navigateur — sous la réponse, à toute étape.
  const open = actions.ouvrir;
  const onGithub = card.surGithub === true && open !== undefined ? [buttonOfTheFamily(doc, ON_GITHUB, () => open(), { sorte: "discret" })] : [];
  for (const button of onGithub) button.className = "sur-github";

  if (seenOne.vu === "attente" || seenOne.vu === "jouee") {
    // Répondue : plus rien à trancher ici. La réponse rappelée, puis où elle en est, à voix basse, le détail au survol.
    const reminder = created(doc, "p", `${YOUR_ANSWER}: “${seenOne.reponse}”`);
    reminder.className = "reponse-envoyee";
    const or = created(doc, "p");
    or.className = "ou-en-est";
    or.append(created(doc, "span", seenOne.vu === "attente" ? QUEUED : PLAYED), hover(doc, seenOne.vu === "attente" ? QUEUED_DETAIL : seenOne.dit));
    root.append(...head, reminder, or, ...onGithub, ...remains);
  } else if (readOnly) root.append(...head, ...onGithub, ...remains);
  else root.append(...head, choice, openTheField, sentence, ...onGithub, ...remains);
  if (inRoute) {
    const sending = created(doc, "span", IN_ROUTE);
    sending.className = "en-route";
    root.append(sending);
  }
  if (seenOne.vu === "refus") {
    root.append(lineError(doc, seenOne.dit, seenOne.detail, { classe: "refus" }));
  }

  // L'action secondaire, sous tout le reste : la carte passée au second (ticket 3133) — la carte se tranche sans elle.
  root.append(rowOfSecond(doc, ticket, second, actions.demander));
  return [root];
}
