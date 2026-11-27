// @ts-check
// Les briques communes de la vue : ce que l'app dit moins, et dit pareil partout. Une explication
// ne s'écrit pas à plat dans l'écran, elle se montre au survol ou au focus clavier d'une icône
// d'aide ; une lecture qui manque tient en une ligne (components/line-error), son détail technique dans le survol ;
// un bouton recommandé se distingue des autres, et son prix, s'il en a un, est dans son survol ;
// la confirmation d'un geste est dans components/confirmation.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien
// et les tests un faux. Il ne pose rien dans la page, et ne câble aucun écran : il rend des éléments. Ses boutons sont
// ceux de la famille unique (components/button, ticket 2916).

import { button } from "./components/button/button.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Un prix « nul ou absent » : rien, 0, ou un texte vide. Ni survol ni ligne n'en naissent.
/** @param {unknown} price @returns {string} */
export function priceSays(price) {
  if (typeof price === "number") return price > 0 ? String(price) : "";
  return typeof price === "string" ? price.trim() : "";
}

// La réponse qu'une carte de TODO recommande (ticket 3434) : le rang de son choix, à partir de 1, et pourquoi en une ligne — nul
// quand elle ne le dit pas. Une carte qui ne dit rien de sa recommandation recommande son premier choix (ticket 2922) ; celle
// qui dit n'en recommander aucune (un écart du manager sans fondement pour en recommander une) n'en met aucune en avant. Rien
// sans question ni choix.
/**
 * @param {{ question: string | null, choix: { texte: string }[], recommandation?: { rang: number, pourquoi: string } | null }} carte
 * @returns {{ rang: number, texte: string, pourquoi: string | null } | null}
 */
export function recommendationOf({ question, choix: choice, recommandation: recommendation }) {
  if (question === null || recommendation === null) return null;
  const rank = recommendation === undefined ? 1 : recommendation.rang;
  const taken = choice[rank - 1];
  return taken === undefined ? null : { rang: rank, texte: taken.texte, pourquoi: recommendation?.pourquoi ?? null };
}

// Le survol : un déclencheur (une icône « ? » par défaut) et, à côté, le texte — posé quand le
// pointeur ou le clavier arrive, retiré quand il part. Hors survol, le texte n'est nulle part dans
// l'élément : il n'est pas caché, il n'y est pas. Il reste lisible à qui ne voit pas l'écran, par
// le nom accessible du déclencheur.
/** @param {Fabrique} doc @param {string} text @param {any} [declencheur] */
export function hover(doc, text, declencheur) {
  const root = doc.createElement("span");
  root.className = "survol";
  const target = declencheur ?? doc.createElement("button");
  if (declencheur === undefined) {
    target.type = "button";
    target.className = "aide";
    target.textContent = "?";
  }
  target.ariaLabel = text;
  root.append(target);
  /** @type {any} */
  let bubble;
  const show = () => {
    if (bubble !== undefined) return;
    bubble = doc.createElement("span");
    bubble.className = "bulle";
    bubble.role = "tooltip";
    bubble.textContent = text;
    root.append(bubble);
  };
  const hide = () => {
    bubble?.remove();
    bubble = undefined;
  };
  for (const [event, action] of /** @type {const} */ ([["mouseenter", show], ["focus", show], ["mouseleave", hide], ["blur", hide]])) {
    root.addEventListener(event, action);
    target.addEventListener(event, action);
  }
  // Échap ferme, comme pour tout survol.
  root.addEventListener("keydown", (/** @type {{ key?: string }} */ event) => {
    if (event.key === "Escape") hide();
  });
  return root;
}

// Un bouton d'action. `recommande` le distingue des autres (la sorte recommandée de la famille, et `aria-` de rien
// d'autre : c'est une question de peau) ; `sorte` en choisit une autre (discret, danger). `prix` : nul ou absent, il
// n'y a ni survol ni icône ; sinon le prix est dans le survol, pas écrit sous le bouton. `coupe` : son libellé tient sur
// une ligne, coupé, entier au survol (la famille, `button.js`).
/** @param {Fabrique} doc @param {string} wording @param {() => void} action @param {{ recommande?: boolean, sorte?: import("./components/button/button.js").Kind, grand?: boolean, coupe?: boolean, prix?: number | string | null }} [options] */
export function buttonAction(doc, wording, action, { recommande: recommended = false, sorte: kind, grand = false, coupe: cut = false, prix: price } = {}) {
  const group = doc.createElement("span");
  group.className = "action";
  group.append(button(doc, wording, action, { sorte: recommended ? "recommande" : kind, grand, coupe: cut }));
  const cost = priceSays(price);
  if (cost !== "") group.append(hover(doc, cost));
  return group;
}

// Une case à cocher nommée (ticket 1307, reprise par le ticket 1510) : ce qu'elle coche, et dessous, s'il y a quoi, ce
// qui le dit en plus. `mono` : son nom est un mot de la machine, écrit tel qu'il se déclare (`navigateur-headless`).
// `changer` reçoit l'état de la case à chaque clic.
/** @param {Fabrique} doc @param {{ nom: string, dit: string, cochee: boolean, mono?: boolean }} quoi @param {(tickedOne: boolean) => void} change */
export function caseATick(doc, { nom: name, dit: said, cochee: tickedOne, mono = false }, change) {
  const root = doc.createElement("label");
  root.className = "capacite";
  const ticked = doc.createElement("input");
  ticked.type = "checkbox";
  ticked.checked = tickedOne;
  ticked.ariaLabel = name;
  ticked.addEventListener("change", () => change(ticked.checked === true));
  const called = doc.createElement("span");
  called.textContent = name;
  if (mono) called.className = "mono";
  root.append(ticked, called);
  if (said !== "") {
    const note = doc.createElement("small");
    note.textContent = said;
    root.append(note);
  }
  return root;
}

// Un bloc replié derrière une ligne (ticket 1456) : ce qui sert rarement — une lecture brute, un historique, un
// réglage — se montre fermé, sa ligne disant son titre et, en quelques mots, ce qu'il contient ; l'ouvrir montre le
// reste. `ouvert` : ce que le chef en a laissé — la vue le retient d'une lecture à l'autre, que le bloc reposé ne se
// referme pas sous ses yeux ; `basculer` le lui dit. `aide` : ce qu'il est, au survol de sa ligne.
/** @param {Fabrique} doc @param {{ titre: string, resume: string, aide?: string, ouvert?: boolean, basculer?: (opened: boolean) => void }} ligne @param {any[]} content */
export function folded(doc, { titre: title, resume, aide: help, ouvert: opened = false, basculer: toggle }, content) {
  const root = doc.createElement("details");
  root.className = "replie";
  root.open = opened;
  const head = doc.createElement("summary");
  if (help !== undefined) head.title = help;
  head.append(...titleAndResume(doc, title, resume));
  root.append(head, ...content);
  root.addEventListener("toggle", () => toggle?.(root.open === true));
  return root;
}

// Un bloc qui n'a rien à dire — tout à zéro, rien en cours — tient en une ligne, pas un tableau (ticket 1456) : son
// titre, et ce qu'il dirait, en mots.
/** @param {Fabrique} doc @param {string} title @param {string} said */
export function oneLine(doc, title, said) {
  const root = doc.createElement("p");
  root.className = "une-ligne";
  root.append(...titleAndResume(doc, title, said));
  return root;
}

/** @param {Fabrique} doc @param {string} title @param {string} resume */
function titleAndResume(doc, title, resume) {
  const name = doc.createElement("strong");
  name.textContent = title;
  const said = doc.createElement("span");
  said.className = "resume";
  said.textContent = resume;
  return [name, said];
}
