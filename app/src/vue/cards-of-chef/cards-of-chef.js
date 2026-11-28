// @ts-check
// Les cartes qui attendent le chef, à la largeur d'un téléphone (ticket 2915, épique 2897, maquette `Phone.dc.html` de
// docs/maquettes/app/) : sur un téléphone, le chef ne fait que répondre à des cartes. L'app s'ouvre sur leur liste ; un
// toucher ouvre la carte, dont chaque réponse part par le geste de la carte de TODO (`card-todo.js`, `repondre`) ; envoyée,
// l'écran dit « Sent to the kitchen. ». Trois vues, dans cet ordre : la liste, la carte, l'envoi.
// Les boutons sont ceux de la famille (components/button), en 44 px à cette largeur ; la peau est dans `cards-of-chef.css`.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { priceSays, recommendationOf } from "../bricks.js";
import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("../../card-todo.ts").CardOfTodo} CardOfTodo */
/** @typedef {import("../../card-todo.ts").Answer} Answer */
/** @typedef {{ projet: string, ticket: number, age: string, todo: CardOfTodo }} Card */

export const TITLE = "Awaiting you";
export const IN_HEAD = "The kitchen works on. These are the only choices that need you.";
export const RECOMMENDED = "Recommended";
export const DETAILS = "details";
export const ITS_WORD = "Or answer in your own words";
export const SEND = "Send";
export const SENT = "Sent to the kitchen.";
export const RETURN = "Back to the list";
export const IN_ROUTE = "Sending your answer…";
// Le champ de la carte ouverte, tel que la vue le reconnaît pour lui rendre le clavier quand la page est reposée.
export const FIELD = "reponse-du-chef";
export const NOTHING_N_AWAITING = "Nothing awaits you.";

/** @param {number} n */
export const account = (n) => `${n} ${n === 1 ? "card" : "cards"}`;

// Ce que la carte demande, en quelques mots : le genre de sa question, et ses choix.
/** @param {CardOfTodo} todo */
export function kindOfTheCard({ sorte: kind, choix: choice, question }) {
  const options = `${choice.length} ${choice.length === 1 ? "option" : "options"}`;
  if (question === null || choice.length === 0) return "Review only you can make";
  // Une PR à merger à la main, mise de côté par la station ou d’un fork (tickets 3368, 3367) : un merge, pas un choix.
  if (kind === "merge-by-hand") return `Merge by hand · ${options}`;
  if (kind === "hold") return `Lift the hold · ${options}`;
  return `${kind === "design" ? "Design choice" : "Product choice"} · ${options}`;
}

// Ce que le reste de l'app fait, en une ligne sous la liste : combien de projets cuisent, quand la vue le sait.
/** @param {number} cook */
export const ELSEWHERE = (cook) => `Elsewhere: ${cook} ${cook === 1 ? "project" : "projects"} cooking.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [text] */
function created(doc, balise, classe, text) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// L'en-tête : « Awaiting you » et le nombre de cartes ; une flèche en 44 px ramène à la liste hors de la liste.
/** @param {Fabrique} doc @param {number} cards @param {(() => void) | undefined} back */
function header(doc, cards, back) {
  const head = created(doc, "header", "entete-des-cartes");
  if (back !== undefined) {
    const arrow = created(doc, "button", "retour-aux-cartes");
    arrow.type = "button";
    arrow.ariaLabel = RETURN;
    arrow.textContent = "‹";
    arrow.addEventListener("click", back);
    head.append(arrow);
  }
  const title = created(doc, "h2", undefined, TITLE);
  const count = created(doc, "span", "nombre-de-cartes", account(cards));
  head.append(title, count);
  return head;
}

// La liste : une carte par chose qui attend, d'un seul toucher (le bouton est la carte). `avis` : ce que la lecture des
// projets a de pire à dire (GitHub qui refuse le téléphone…), posé sous la liste. `ailleurs` : la ligne sous la liste. `tete` :
// ce qui attend le chef sans être une carte — la ligne du disjoncteur ouvert et son « Resume » (todo-breaker-line.js) —, en
// tête de la liste ; avec elle, la liste ne dit pas que rien ne t'attend.
/** @param {Fabrique} doc @param {{ cartes: Card[], ailleurs?: string, avis?: any[], tete?: any[], ouvrir: (card: Card) => void }} liste */
export function setTheList(doc, { cartes: cards, ailleurs: elsewhere, avis: opinion = [], tete: head = [], ouvrir: open }) {
  const body = created(doc, "div", "corps-des-cartes");
  body.dataset.vu = "liste";
  body.append(...head);
  if (cards.length > 0 || head.length === 0) body.append(created(doc, "p", "mot-des-cartes", cards.length === 0 ? NOTHING_N_AWAITING : IN_HEAD));
  for (const card of cards) {
    const key = created(doc, "button", "carte-a-ouvrir");
    key.type = "button";
    key.dataset.ticket = String(card.ticket);
    const top = created(doc, "span", "haut-de-carte");
    top.append(created(doc, "span", "numero-de-carte", `#${card.ticket} · ${card.projet}`), created(doc, "span", undefined, card.age));
    key.append(top, created(doc, "span", "question-de-carte", card.todo.question ?? card.todo.resume ?? ""), created(doc, "span", "genre-de-carte", kindOfTheCard(card.todo)));
    key.addEventListener("click", () => open(card));
    body.append(key);
  }
  body.append(...opinion);
  if (elsewhere !== undefined) body.append(created(doc, "p", "ailleurs", elsewhere));
  return [header(doc, cards.length, undefined), body];
}

// La carte ouverte : son numéro et son projet, sa question, ce qui se passe, un bouton par choix — la réponse recommandée,
// le premier ou celui que la carte dit (ticket 3434), rempli de l'accent —, puis le champ pour répondre dans ses mots et « Send ». Un choix est la réponse : rien
// d'autre n'est demandé. `refus` : ce qui a empêché l'envoi, en une ligne, le détail au survol ; la carte garde ses gestes.
/**
 * @param {Fabrique} doc
 * @param {{ carte: Card, total: number, brouillon: string, enRoute: boolean, refus?: { dit: string, detail: string }, retour: () => void, ecrire: (text: string) => void, repondre: (answer: Answer) => void }} vue
 */
export function setTheCard(doc, { carte: card, total, brouillon: draft, enRoute: inRoute, refus: refusal, retour: back, ecrire: write, repondre: reply }) {
  const { todo } = card;
  const body = created(doc, "div", "corps-des-cartes");
  body.dataset.vu = "carte";
  body.append(created(doc, "span", "numero-de-carte", `#${card.ticket} · ${card.projet}`));
  // À première vue, dans l'ordre de la carte du bureau (ticket 3086) : ce qui se passe, en une ligne ; la question ; la réponse
  // recommandée ; les boutons. Le reste du commentaire est derrière « details », fermé.
  if (todo.question !== null && todo.resume !== undefined) body.append(created(doc, "p", "mot-des-cartes", todo.resume));
  body.append(created(doc, "h1", undefined, todo.question ?? todo.resume ?? ""));
  // La réponse recommandée, et pourquoi quand la carte le dit ; aucune quand le manager n'en recommande pas (ticket 3434).
  const recommended = recommendationOf(todo);
  if (recommended !== null) body.append(created(doc, "p", "mot-des-cartes recommandation", `${RECOMMENDED}: ${recommended.texte}${recommended.pourquoi === null ? "" : ` — ${recommended.pourquoi}`}`));
  todo.choix.forEach(({ texte: text, prix: price }, rank) => {
    const choice = button(doc, text, () => reply({ question: todo.question, choix: rank + 1 }), { sorte: rank + 1 === recommended?.rang ? "recommande" : "secondaire" });
    choice.className = `${choice.className} choix-du-chef`.trim();
    const cost = priceSays(price);
    if (cost !== "") choice.title = cost;
    choice.disabled = inRoute;
    body.append(choice);
  });
  const label = created(doc, "label", "mot-des-cartes", ITS_WORD);
  label.htmlFor = "reponse-du-chef";
  const input = created(doc, "textarea", "saisie-du-chef");
  input.id = "reponse-du-chef";
  input.dataset.champ = FIELD;
  input.rows = 3;
  input.value = draft;
  input.disabled = inRoute;
  const send = button(doc, todo.repondre ?? SEND, () => reply({ question: todo.question, texte: input.value }));
  send.className = `${send.className} envoi-du-chef`.trim();
  send.disabled = inRoute || draft.trim() === "";
  input.addEventListener("input", () => {
    write(input.value);
    send.disabled = input.value.trim() === "";
  });
  body.append(label, input, send);
  if (todo.contexte !== undefined) {
    const fold = created(doc, "details", "details-de-la-carte");
    fold.append(created(doc, "summary", undefined, DETAILS));
    for (const paragraph of todo.contexte.split(/\n{2,}/)) fold.append(created(doc, "p", "mot-des-cartes", paragraph));
    body.append(fold);
  }
  if (inRoute) body.append(created(doc, "p", "mot-des-cartes", IN_ROUTE));
  if (refusal !== undefined) body.append(lineError(doc, refusal.dit, refusal.detail, { classe: "refus", alerte: true }));
  return Object.assign([header(doc, total, back), body], { saisie: input });
}

// L'envoi : la coche, « Sent to the kitchen. », et où en est le projet. `reste` : les cartes qui l'attendent encore sur lui.
/** @param {Fabrique} doc @param {{ ticket: number, projet: string, reste: number, total: number, retour: () => void }} vue */
export function setTheSend(doc, { ticket, projet: project, reste: remains, total, retour: back }) {
  const body = created(doc, "div", "corps-des-cartes");
  body.dataset.vu = "envoyee";
  const ticked = created(doc, "span", "coche-d-envoi");
  ticked.role = "img";
  ticked.ariaLabel = "Sent";
  const suite = remains === 0 ? `Nothing else awaits you on ${project}.` : `${account(remains)} still ${remains === 1 ? "awaits" : "await"} you on ${project}.`;
  const returnAtTheList = button(doc, RETURN, back);
  returnAtTheList.className = `${returnAtTheList.className} envoi-du-chef`.trim();
  body.append(ticked, created(doc, "h1", undefined, SENT), created(doc, "p", "mot-des-cartes", `#${ticket} is back on the rail. ${suite}`), returnAtTheList);
  return [header(doc, total, back), body];
}
