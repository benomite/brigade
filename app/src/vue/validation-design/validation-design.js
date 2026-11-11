// @ts-check
// La carte « Validate its screen » (ticket 3185, épique 3180) : une livraison design verte que la pass retient pour le chef
// (ticket 3184). Dans TODO comme sur le téléphone, la même carte, dans cet ordre : la question ; les captures avant et après de
// chaque écran, l'une sous l'autre, lues sans un clic ; le lien de la pull request ; « Validate », le geste recommandé ; puis
// le champ du commentaire et « Send back to the kitchen », éteint tant que le commentaire est vide. Le prix de chaque geste
// est au survol. Chaque geste part par le pont : sur le desktop, le process principal joue la commande du runtime
// (validation-design-github.ts, `jouerLaValidation`) ; sur le téléphone, il s'écrit sur GitHub (`validerSurGithub`) ; fait, la carte quitte TODO (`sansLesValidees`) ; refusé, elle reste,
// et dit pourquoi en une ligne, le détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, les captures déjà posées et ce que chaque geste
// appelle, et rend un élément.

import { boutonAction } from "../briques.js";
import { bouton } from "../composants/bouton/bouton.js";
import { carteDeReponse } from "../composants/carte-attente/carte-attente.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { rangeeDuSecond } from "../todo-carte/demander-au-second.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../carte-todo.ts").CarteDeTodo} CarteDeTodo */
/** @typedef {import("./validation-design-github.ts").GesteDeValidation} GesteDeValidation */
/** @typedef {import("./validation-design-github.ts").RenduDeValidation} RenduDeValidation */

// Le geste en route depuis cette vue, pour une carte.
//   repos   rien n'est parti d'ici
//   envoi   un geste part : les boutons et le champ attendent
//   refus   rien n'a été fait (`dit`, et `detail` au survol) : la carte reste, ses gestes aussi
//   fait    le runtime l'a fait : la carte quitte TODO
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", geste: GesteDeValidation["geste"] }
 *   | { etape: "refus", dit: string, detail: string }
 *   | { etape: "fait", dit: string }} Etat
 */

/** @type {Etat} */
export const REPOS = { etape: "repos" };

export const VALIDER = "Validate";
export const RENVOYER = "Send back to the kitchen";
export const CHAMP = "What to change on the screen";
export const EN_VALIDATION = "validating…";
export const EN_RENVOI = "sending back to the kitchen…";
// Le champ du commentaire, tel que la vue le reconnaît pour lui rendre le clavier quand la page est reposée.
export const CHAMP_DU_COMMENTAIRE = "commentaire-validation";
/** @param {number} pr */
export const LIEN = (pr) => `Pull request #${pr}`;
/** @param {number} pr */
export const PRIX_VALIDER = (pr) => `PR #${pr} is merged into the integration branch from your GitHub account, and the card is closed — a merge is not undone from the app`;
/** @param {number} ticket */
export const PRIX_RENVOYER = (ticket) => `your comment is posted on #${ticket} as what to change, and the card is closed: a cook takes the ticket up again — it may be launched on the project's quota`;

// L'étape qui suit ce que le process principal a rendu.
/** @param {RenduDeValidation | undefined} rendu @returns {Etat} */
export function apresRendu(rendu) {
  if (rendu === undefined) return { etape: "refus", dit: "nothing was done: this project is not known to the app", detail: "" };
  if ("refus" in rendu) return { etape: "refus", dit: rendu.refus, detail: rendu.detail };
  return { etape: "fait", dit: rendu.fait };
}

// Une carte « Validate its screen » : celle dont la carte de TODO porte `validation`.
/** @param {CarteDeTodo | undefined} todo */
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
    const cartes = colonne.cartes.filter(({ ticket }) => !faites.has(ticket));
    const autres = colonne.autres?.filter(({ ticket }) => !faites.has(ticket));
    if (cartes.length === colonne.cartes.length && autres?.length === colonne.autres?.length) return colonne;
    const compte = colonne.compte === String(colonne.cartes.length) ? String(cartes.length) : colonne.compte;
    return { ...colonne, cartes, compte, ...(autres === undefined ? {} : { autres }) };
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
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CarteDeTodo} carte
 * @param {Etat} etat
 * @param {{ captures: any[], commentaire: string, cle: string, lectureSeule?: boolean, grand?: boolean, second?: { envoi: true } | { parti: string } | { refus: string } }} posees
 * @param {{ valider: () => void, renvoyer: (commentaire: string) => void, ecrire: (texte: string) => void, ouvrirPr: () => void, demander?: () => void }} gestes
 */
export function poserCarteDeValidation(doc, ticket, carte, etat, { captures, commentaire, cle, lectureSeule = false, grand = false, second }, gestes) {
  const posee = poserLaCarte(doc, ticket, carte, etat, { captures, commentaire, cle, lectureSeule, grand }, gestes);
  if (gestes.demander !== undefined) posee.append(rangeeDuSecond(doc, ticket, second, gestes.demander));
  return [posee];
}

/**
 * @param {Fabrique} doc @param {number} ticket @param {CarteDeTodo} carte @param {Etat} etat
 * @param {{ captures: any[], commentaire: string, cle: string, lectureSeule: boolean, grand: boolean }} posees
 * @param {{ valider: () => void, renvoyer: (commentaire: string) => void, ecrire: (texte: string) => void, ouvrirPr: () => void }} gestes
 */
function poserLaCarte(doc, ticket, carte, etat, { captures, commentaire, cle, lectureSeule, grand }, gestes) {
  const racine = carteDeReponse(doc, { sorte: carte.sorte });
  racine.className = `${racine.className} carte-validation`;
  racine.ariaLabel = `the screen #${ticket} asks you to validate`;
  const enRoute = etat.etape === "envoi";
  const { validation } = carte;
  if (carte.question !== null) racine.append(cree(doc, "p", "question-carte", carte.question));
  if (validation === undefined || "illisible" in validation) {
    racine.append(cree(doc, "p", "validation-illisible", validation?.illisible ?? "this card does not say which pull request it validates"));
    return racine;
  }
  const ecrans = cree(doc, "div", "captures-de-validation");
  ecrans.append(...captures);
  const lien = bouton(doc, LIEN(validation.pr), gestes.ouvrirPr, { sorte: "discret" });
  lien.className = `${lien.className} lien-de-la-pr`.trim();
  lien.title = "opens the pull request on GitHub";
  racine.append(ecrans, lien);
  if (lectureSeule) return racine;

  const valider = boutonAction(doc, VALIDER, gestes.valider, { recommande: true, grand, prix: PRIX_VALIDER(validation.pr) });
  const boutonValider = valider.children?.[0];
  if (boutonValider !== undefined) boutonValider.disabled = enRoute;

  const phrase = cree(doc, "div", "phrase renvoi");
  const saisie = cree(doc, "textarea");
  saisie.value = commentaire;
  saisie.rows = 2;
  saisie.placeholder = CHAMP;
  saisie.ariaLabel = `what to change on the screen of #${validation.ticket}`;
  saisie.disabled = enRoute;
  saisie.dataset.cle = cle;
  saisie.dataset.champ = CHAMP_DU_COMMENTAIRE;
  const renvoyer = boutonAction(doc, RENVOYER, () => gestes.renvoyer(saisie.value), { grand, prix: PRIX_RENVOYER(validation.ticket) });
  const boutonRenvoyer = renvoyer.children?.[0];
  if (boutonRenvoyer !== undefined) boutonRenvoyer.disabled = enRoute || commentaire.trim() === "";
  saisie.addEventListener("input", () => {
    gestes.ecrire(saisie.value);
    if (boutonRenvoyer !== undefined) boutonRenvoyer.disabled = saisie.value.trim() === "";
  });
  phrase.append(saisie, renvoyer);
  racine.append(valider, phrase);
  if (enRoute) racine.append(cree(doc, "span", "en-route", etat.geste === "valider" ? EN_VALIDATION : EN_RENVOI));
  if (etat.etape === "refus") racine.append(ligneErreur(doc, etat.dit, etat.detail, { classe: "refus" }));
  return racine;
}
