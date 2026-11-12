// @ts-check
// Le ticket sensible dans l'app (ticket 3224, épique 3214 ; docs/sensitive-tickets.md) :
//   - sa carte du rail porte la marque « sensitive », en tête de ses étiquettes (`marquerSensible`) — une carte sans le
//     label ne la porte pas ;
//   - sa livraison verte, que la pass ne merge pas, attend dans TODO sur la carte « review before merge » (runtime/src/
//     sensible/, ticket 3223). Dans cet ordre : la question ; le lien de la pull request, qui l'ouvre d'un clic ; « Merge »,
//     le geste recommandé ; puis le champ de la note et « Send back », éteint tant que la note est vide. Deux réponses, pas
//     une de plus. Le prix de chaque geste est au survol. Chaque geste part par le pont : le process principal joue la
//     commande `sensitive` du runtime (carte-sensible-github.ts, `jouerLaRevue`) ; fait, la carte quitte TODO ; refusé, elle
//     reste, et dit pourquoi en une ligne, le détail au survol.
// La carte reprend les briques de la carte « Validate its screen » (validation-design/) : la carte de réponse, le bouton, la
// ligne d'erreur, l'étape d'un geste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément et ce que chaque geste appelle, et rend un élément.

import { boutonAction } from "../briques.js";
import { bouton } from "../composants/bouton/bouton.js";
import { carteDeReponse } from "../composants/carte-attente/carte-attente.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { rangeeDuSecond } from "../todo-carte/demander-au-second.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../carte-todo.ts").CarteDeTodo} CarteDeTodo */
/** @typedef {import("./carte-sensible-github.ts").GesteSensible} GesteSensible */

// Le geste en route depuis cette vue, pour une carte.
//   repos   rien n'est parti d'ici
//   envoi   un geste part : les boutons et le champ attendent
//   refus   rien n'a été fait (`dit`, et `detail` au survol) : la carte reste, ses gestes aussi
//   fait    le runtime l'a fait : la carte quitte TODO
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", geste: GesteSensible["geste"] }
 *   | { etape: "refus", dit: string, detail: string }
 *   | { etape: "fait", dit: string, geste?: GesteSensible["geste"] }} Etat
 */

/** @type {Etat} */
export const REPOS = { etape: "repos" };

// Les mots du glossaire (docs/glossary.md) : `sensitive`, `review before merge`.
export const MARQUE = "sensitive";
export const SURVOL_DE_LA_MARQUE = "this ticket is labelled sensitive: once judged green, its delivery waits for your review before merge";
export const MERGER = "Merge";
export const RENVOYER = "Send back";
export const CHAMP = "Note: what to change — required to send back";
export const EN_MERGE = "merging…";
export const EN_RENVOI = "sending back…";
// Le geste fait : le bouton cliqué le dit, au lieu de disparaître sans un mot (ticket 3386).
export const MERGE = "merged ✓";
export const RENVOYE = "sent back ✓";
// Le temps que la carte garde sa confirmation avant de quitter TODO.
export const CONFIRMATION_MS = 1200;
// Le champ de la note, tel que la vue le reconnaît pour lui rendre le clavier quand la page est reposée.
export const CHAMP_DE_LA_NOTE = "note-sensible";
/** @param {number} pr */
export const LIEN = (pr) => `Pull request #${pr}`;
/** @param {number} pr */
export const PRIX_MERGER = (pr) => `PR #${pr} is merged into the integration branch from your GitHub account, and the card is closed — a merge is not undone from the app`;
/** @param {number} ticket */
export const PRIX_RENVOYER = (ticket) => `your note is posted on #${ticket} as what to change, and the card is closed: a cook takes the ticket up again — it may be launched on the project's quota`;
export const SANS_PONT = "nothing was done: this app does not play the kitchen's command — answer this card from the desktop app";

// La marque « sensitive » en tête des étiquettes d'une carte du rail (etiquettes-de-bon.js) : posées sur la ligne qu'elles
// ont déjà, ou sur une ligne à elle si la carte n'en a pas.
/** @param {Fabrique} doc @param {any | null} etiquettes */
export function marquerSensible(doc, etiquettes) {
  const marque = doc.createElement("span");
  marque.className = "etiquette etiquette-sensible";
  marque.textContent = MARQUE;
  marque.title = SURVOL_DE_LA_MARQUE;
  const ligne = etiquettes ?? doc.createElement("span");
  if (etiquettes === null) ligne.className = "etiquettes";
  ligne.prepend(marque);
  return ligne;
}

// L'étape qui suit ce que le process principal a rendu.
/** @param {import("./carte-sensible-github.ts").RenduSensible | undefined} rendu @returns {Etat} */
export function apresRendu(rendu) {
  if (rendu === undefined) return { etape: "refus", dit: "nothing was done: this project is not known to the app", detail: "" };
  if ("refus" in rendu) return { etape: "refus", dit: rendu.refus, detail: rendu.detail };
  return { etape: "fait", dit: rendu.fait };
}

// Une carte « review before merge » : celle dont la carte de TODO porte `revue`.
/** @param {CarteDeTodo | undefined} todo */
export const estUneRevue = (todo) => todo?.revue !== undefined;

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La carte, dans son état. `note` : ce que le chef a déjà tapé ; `cle` marque le champ. `lectureSeule` : le projet est en
// lecture seule — la carte se lit, rien ne la tranche d'ici. `grand` : à la largeur d'un téléphone, les boutons en 44 px.
// `second` : dans TODO, la carte finit par « ask the second », comme toute carte de TODO (ticket 3133) ; `demander` la passe
// au second.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {CarteDeTodo} carte
 * @param {Etat} etat
 * @param {{ note: string, cle: string, lectureSeule?: boolean, grand?: boolean, second?: { envoi: true } | { parti: string } | { refus: string } }} posees
 * @param {{ merger: () => void, renvoyer: (note: string) => void, ecrire: (texte: string) => void, ouvrirPr: () => void, demander?: () => void }} gestes
 */
export function poserCarteSensible(doc, ticket, carte, etat, { note, cle, lectureSeule = false, grand = false, second }, gestes) {
  const racine = carteDeReponse(doc, { sorte: carte.sorte });
  racine.className = `${racine.className} carte-sensible`;
  racine.ariaLabel = `the sensitive ticket #${ticket} waits for your review before merge`;
  const { revue } = carte;
  if (carte.question !== null) racine.append(cree(doc, "p", "question-carte", carte.question));
  if (revue === undefined || "illisible" in revue) {
    racine.append(cree(doc, "p", "revue-illisible", revue?.illisible ?? "this card does not say which pull request it holds"));
  } else {
    const lien = bouton(doc, LIEN(revue.pr), gestes.ouvrirPr, { sorte: "discret" });
    lien.className = `${lien.className} lien-de-la-pr`.trim();
    lien.title = "opens the pull request on GitHub";
    racine.append(lien);
    if (!lectureSeule) racine.append(...poserLesReponses(doc, revue, etat, { note, cle, grand }, gestes));
  }
  if (gestes.demander !== undefined) racine.append(rangeeDuSecond(doc, ticket, second, gestes.demander));
  return [racine];
}

// Les deux réponses : « Merge », puis la note et « Send back » — puis, s'il y a lieu, le geste en route ou ce qui l'a refusé.
/**
 * @param {Fabrique} doc @param {{ pr: number, ticket: number }} revue @param {Etat} etat
 * @param {{ note: string, cle: string, grand: boolean }} posees
 * @param {{ merger: () => void, renvoyer: (note: string) => void, ecrire: (texte: string) => void }} gestes
 */
function poserLesReponses(doc, revue, etat, { note, cle, grand }, gestes) {
  const enRoute = etat.etape === "envoi";
  const fait = etat.etape === "fait";
  const geste = etat.etape === "envoi" || etat.etape === "fait" ? etat.geste : undefined;
  const dit = (/** @type {GesteSensible["geste"]} */ lequel, /** @type {string} */ libelle) =>
    geste !== lequel ? libelle : enRoute ? (lequel === "merger" ? EN_MERGE : EN_RENVOI) : fait ? (lequel === "merger" ? MERGE : RENVOYE) : libelle;
  const merger = boutonAction(doc, dit("merger", MERGER), gestes.merger, { recommande: true, grand, prix: PRIX_MERGER(revue.pr) });
  const boutonMerger = merger.children?.[0];
  if (boutonMerger !== undefined) boutonMerger.disabled = enRoute || fait;

  const phrase = cree(doc, "div", "phrase renvoi");
  const saisie = cree(doc, "textarea");
  saisie.value = note;
  saisie.rows = 2;
  saisie.placeholder = CHAMP;
  saisie.ariaLabel = `the note sending #${revue.ticket} back: what to change`;
  saisie.required = true;
  saisie.disabled = enRoute || fait;
  saisie.dataset.cle = cle;
  saisie.dataset.champ = CHAMP_DE_LA_NOTE;
  const renvoyer = boutonAction(doc, dit("renvoyer", RENVOYER), () => {
    if (saisie.value.trim() !== "") gestes.renvoyer(saisie.value);
  }, { grand, prix: PRIX_RENVOYER(revue.ticket) });
  const boutonRenvoyer = renvoyer.children?.[0];
  if (boutonRenvoyer !== undefined) boutonRenvoyer.disabled = enRoute || fait || note.trim() === "";
  saisie.addEventListener("input", () => {
    gestes.ecrire(saisie.value);
    if (boutonRenvoyer !== undefined) boutonRenvoyer.disabled = saisie.value.trim() === "";
  });
  phrase.append(saisie, renvoyer);
  return [
    merger,
    phrase,
    ...(enRoute ? [cree(doc, "span", "en-route", etat.geste === "merger" ? EN_MERGE : EN_RENVOI)] : []),
    ...(etat.etape === "refus" ? [ligneErreur(doc, etat.dit, etat.detail, { classe: "refus" })] : []),
  ];
}
