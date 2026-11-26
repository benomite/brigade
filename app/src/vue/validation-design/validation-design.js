// @ts-check
// La carte « Validate its screen » (ticket 3185, épique 3180) : une livraison design verte que la pass retient pour le chef
// (ticket 3184). Dans TODO comme sur le téléphone, la même carte, dans cet ordre : la question ; les captures avant et après de
// chaque écran, l'une sous l'autre, lues sans un clic ; le lien de la pull request ; « Validate », le geste recommandé ; puis
// le champ du commentaire et « Send back to the kitchen », éteint tant que le commentaire est vide. Le prix de chaque geste
// est au survol. Chaque geste part par le pont : sur le desktop, le process principal joue la commande du runtime
// (validation-design-github.ts, `jouerLaValidation`) ; sur le téléphone, il s'écrit sur GitHub (`validerSurGithub`) ; fait, la carte quitte TODO (`sansLesValidees`) ; refusé, elle reste,
// et dit pourquoi en une ligne, le détail au survol.
// Un clic sur la carte, ou sur l'une de ses captures, l'ouvre en grand : detail-de-validation.js (ticket 3212), qui reprend ses
// deux gestes (`poserLesGestes`).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, les captures déjà posées et ce que chaque geste
// appelle, et rend un élément.

import { buttonAction } from "../briques.js";
import { button } from "../composants/button/button.js";
import { cardDeAnswer } from "../composants/card-wait/card-wait.js";
import { lineError } from "../composants/line-error/line-error.js";
import { rangeeDuSecond } from "../todo-card/demander-au-second.js";
import { PR_DU_TICKET } from "../pr-du-ticket.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../card-todo.ts").CardDeTodo} CardDeTodo */
/** @typedef {import("./validation-design-github.ts").ActionDeValidation} ActionDeValidation */
/** @typedef {import("./validation-design-github.ts").RenduDeValidation} RenduDeValidation */

// Le geste en route depuis cette vue, pour une carte.
//   repos   rien n'est parti d'ici
//   envoi   un geste part : les boutons et le champ attendent
//   refus   rien n'a été fait (`dit`, et `detail` au survol) : la carte reste, ses gestes aussi
//   fait    le runtime l'a fait (`geste`) : la carte dit ce qui a été fait, un court moment, puis quitte TODO
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", geste: ActionDeValidation["geste"] }
 *   | { etape: "refus", dit: string, detail: string }
 *   | { etape: "fait", dit: string, geste?: ActionDeValidation["geste"] }} State
 */

/** @type {State} */
export const REPOS = { etape: "repos" };

export const VALIDER = "Validate";
export const RENVOYER = "Send back to the kitchen";
export const CHAMP = "What to change on the screen";
export const EN_VALIDATION = "validating…";
export const EN_SEND_BACK = "sending back to the kitchen…";
// Le geste fait : le bouton cliqué le dit, au lieu de disparaître sans un mot (ticket 3386).
export const VALIDE = "validated ✓";
export const RENVOYE = "back to the kitchen ✓";
// Le temps que la carte garde sa confirmation avant de quitter TODO.
export const CONFIRMATION_MS = 1200;
// Le champ du commentaire, tel que la vue le reconnaît pour lui rendre le clavier quand la page est reposée.
export const CHAMP_DU_COMMENT = "commentaire-validation";
// La PR se dit par son ticket (pr-du-ticket.js, ticket 3716) ; son lien ouvre la PR.
/** @param {number} ticket */
export const LIEN = (ticket) => PR_DU_TICKET(ticket);
/** @param {number} ticket */
export const PRIX_VALIDER = (ticket) => `The ${PR_DU_TICKET(ticket)} is merged into the integration branch from your GitHub account, and the card is closed — a merge is not undone from the app`;
/** @param {number} ticket */
export const PRIX_RENVOYER = (ticket) => `your comment is posted on #${ticket} as what to change, and the card is closed: a cook takes the ticket up again — it may be launched on the project's quota`;

// L'étape qui suit ce que le process principal a rendu.
/** @param {RenduDeValidation | undefined} rendu @returns {State} */
export function apresRendu(rendu) {
  if (rendu === undefined) return { etape: "refus", dit: "nothing was done: this project is not known to the app", detail: "" };
  if ("refus" in rendu) return { etape: "refus", dit: rendu.refus, detail: rendu.detail };
  return { etape: "fait", dit: rendu.fait };
}

// Une carte « Validate its screen » : celle dont la carte de TODO porte `validation`.
/** @param {CardDeTodo | undefined} todo */
export const estUneValidation = (todo) => todo?.validation !== undefined;

// Les colonnes, sans les cartes que le chef vient de valider ou de renvoyer (`faites`, leurs numéros) : elles quittent TODO
// tout de suite, sans attendre que la lecture suivante ne les porte plus. Le compte d'une colonne suit ses cartes.
/**
 * @template {{ compte: string, cartes: { ticket: number }[], autres?: { ticket: number }[] }} C
 * @param {C[]} colonnes @param {ReadonlySet<number>} faites @returns {C[]}
 */
export function sansLesValidees(colonnes, faites) {
  if (faites.size === 0) return colonnes;
  return colonnes.map((colonne) => {
    const cards = colonne.cartes.filter(({ ticket }) => !faites.has(ticket));
    const autres = colonne.autres?.filter(({ ticket }) => !faites.has(ticket));
    if (cards.length === colonne.cartes.length && autres?.length === colonne.autres?.length) return colonne;
    const account = colonne.compte === String(colonne.cartes.length) ? String(cards.length) : colonne.compte;
    return { ...colonne, cartes: cards, compte: account, ...(autres === undefined ? {} : { autres }) };
  });
}

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (texte !== undefined) pose.textContent = texte;
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
 * @param {CardDeTodo} card
 * @param {State} state
 * @param {{ captures: any[], commentaire: string, cle: string, lectureSeule?: boolean, grand?: boolean, second?: { envoi: true } | { parti: string } | { refus: string } }} posees
 * @param {{ valider: () => void, renvoyer: (comment: string) => void, ecrire: (texte: string) => void, ouvrirPr: () => void, ouvrir?: () => void, demander?: () => void }} actions
 */
export function poserCardDeValidation(doc, ticket, card, state, { captures, commentaire: comment, cle, lectureSeule: readOnly = false, grand = false, second }, actions) {
  const posee = poserLaCard(doc, ticket, card, state, { captures, commentaire: comment, cle, lectureSeule: readOnly, grand }, actions);
  if (actions.demander !== undefined) posee.append(rangeeDuSecond(doc, ticket, second, actions.demander));
  return [posee];
}

/**
 * @param {Fabrique} doc @param {number} ticket @param {CardDeTodo} card @param {State} state
 * @param {{ captures: any[], commentaire: string, cle: string, lectureSeule: boolean, grand: boolean }} posees
 * @param {{ valider: () => void, renvoyer: (comment: string) => void, ecrire: (texte: string) => void, ouvrirPr: () => void, ouvrir?: () => void }} actions
 */
function poserLaCard(doc, ticket, card, state, { captures, commentaire: comment, cle, lectureSeule: readOnly, grand }, actions) {
  const racine = cardDeAnswer(doc, { sorte: card.sorte });
  racine.className = `${racine.className} carte-validation`;
  racine.ariaLabel = `the screen #${ticket} asks you to validate`;
  const { validation } = card;
  if (card.question !== null) racine.append(cree(doc, "p", "question-carte", card.question));
  if (validation === undefined || "illisible" in validation) {
    racine.append(cree(doc, "p", "validation-illisible", validation?.illisible ?? "this card does not say which pull request it validates"));
    return racine;
  }
  const screens = cree(doc, "div", "captures-de-validation");
  screens.append(...captures);
  // Un clic sur la carte, ou sur l'une de ses captures, ouvre son détail en grand (detail-de-validation.js, ticket 3212) —
  // et non la fiche du ticket : ce qui s'y clique déjà, ses boutons et son champ, garde son geste. Au clavier, Entrée ou
  // Espace sur ses captures.
  if (actions.ouvrir !== undefined) {
    const ouvrir = actions.ouvrir;
    racine.dataset.ouvrable = "";
    racine.addEventListener("click", (/** @type {Event} */ event) => {
      event.stopPropagation();
      const cible = /** @type {Element | null | undefined} */ (event.target);
      if (cible?.closest?.("button, a, summary, input, textarea, select")) return;
      ouvrir();
    });
    screens.tabIndex = 0;
    screens.title = "opens the screens in large, to zoom on them";
    screens.addEventListener("keydown", (/** @type {KeyboardEvent} */ event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      ouvrir();
    });
  }
  const lien = button(doc, LIEN(validation.ticket), actions.ouvrirPr, { sorte: "discret" });
  lien.className = `${lien.className} lien-de-la-pr`.trim();
  lien.title = "opens the pull request on GitHub";
  racine.append(screens, lien);
  if (readOnly) return racine;

  racine.append(...poserLesActions(doc, validation, state, { commentaire: comment, cle, grand }, actions));
  return racine;
}

// Les deux gestes d'une carte « Validate its screen », sur la carte comme sur son détail (detail-de-validation.js) :
// « Validate », le commentaire et « Send back to the kitchen » — puis, s'il y a lieu, le geste en route ou ce qui l'a refusé.
/**
 * @param {Fabrique} doc @param {{ pr: number, ticket: number }} validation @param {State} state
 * @param {{ commentaire: string, cle: string, grand: boolean }} posees
 * @param {{ valider: () => void, renvoyer: (comment: string) => void, ecrire: (texte: string) => void }} actions
 */
export function poserLesActions(doc, validation, state, { commentaire: comment, cle, grand }, actions) {
  const enRoute = state.etape === "envoi";
  const fait = state.etape === "fait";
  const action = state.etape === "envoi" || state.etape === "fait" ? state.geste : undefined;
  const dit = (/** @type {ActionDeValidation["geste"]} */ lequel, /** @type {string} */ libelle) =>
    action !== lequel ? libelle : enRoute ? (lequel === "valider" ? EN_VALIDATION : EN_SEND_BACK) : fait ? (lequel === "valider" ? VALIDE : RENVOYE) : libelle;
  const valider = buttonAction(doc, dit("valider", VALIDER), actions.valider, { recommande: true, grand, prix: PRIX_VALIDER(validation.ticket) });
  const buttonValider = valider.children?.[0];
  if (buttonValider !== undefined) buttonValider.disabled = enRoute || fait;

  const phrase = cree(doc, "div", "phrase renvoi");
  const saisie = cree(doc, "textarea");
  saisie.value = comment;
  saisie.rows = 2;
  saisie.placeholder = CHAMP;
  saisie.ariaLabel = `what to change on the screen of #${validation.ticket}`;
  saisie.disabled = enRoute || fait;
  saisie.dataset.cle = cle;
  saisie.dataset.champ = CHAMP_DU_COMMENT;
  const renvoyer = buttonAction(doc, dit("renvoyer", RENVOYER), () => actions.renvoyer(saisie.value), { grand, prix: PRIX_RENVOYER(validation.ticket) });
  const buttonRenvoyer = renvoyer.children?.[0];
  if (buttonRenvoyer !== undefined) buttonRenvoyer.disabled = enRoute || fait || comment.trim() === "";
  saisie.addEventListener("input", () => {
    actions.ecrire(saisie.value);
    if (buttonRenvoyer !== undefined) buttonRenvoyer.disabled = saisie.value.trim() === "";
  });
  phrase.append(saisie, renvoyer);
  return [
    valider,
    phrase,
    ...(enRoute ? [cree(doc, "span", "en-route", state.geste === "valider" ? EN_VALIDATION : EN_SEND_BACK)] : []),
    ...(state.etape === "refus" ? [lineError(doc, state.dit, state.detail, { classe: "refus" })] : []),
  ];
}
