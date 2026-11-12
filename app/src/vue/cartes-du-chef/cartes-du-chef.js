// @ts-check
// Les cartes qui attendent le chef, à la largeur d'un téléphone (ticket 2915, épique 2897, maquette `Phone.dc.html` de
// docs/maquettes/app/) : sur un téléphone, le chef ne fait que répondre à des cartes. L'app s'ouvre sur leur liste ; un
// toucher ouvre la carte, dont chaque réponse part par le geste de la carte de TODO (`carte-todo.js`, `repondre`) ; envoyée,
// l'écran dit « Sent to the kitchen. ». Trois vues, dans cet ordre : la liste, la carte, l'envoi.
// Les boutons sont ceux de la famille (composants/bouton), en 44 px à cette largeur ; la peau est dans `cartes-du-chef.css`.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { prixDit } from "../briques.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {import("../../carte-todo.ts").CarteDeTodo} CarteDeTodo */
/** @typedef {import("../../carte-todo.ts").Reponse} Reponse */
/** @typedef {{ projet: string, ticket: number, age: string, todo: CarteDeTodo }} Carte */

export const TITRE = "Awaiting you";
export const EN_TETE = "The kitchen works on. These are the only choices that need you.";
export const RECOMMANDEE = "Recommended";
export const DETAILS = "details";
export const SON_MOT = "Or answer in your own words";
export const ENVOYER = "Send";
export const ENVOYEE = "Sent to the kitchen.";
export const RETOUR = "Back to the list";
export const EN_ROUTE = "Sending your answer…";
// Le champ de la carte ouverte, tel que la vue le reconnaît pour lui rendre le clavier quand la page est reposée.
export const CHAMP = "reponse-du-chef";
export const RIEN_N_ATTEND = "Nothing awaits you.";

/** @param {number} n */
export const compte = (n) => `${n} ${n === 1 ? "card" : "cards"}`;

// Ce que la carte demande, en quelques mots : le genre de sa question, et ses choix.
/** @param {CarteDeTodo} todo */
export function genreDeLaCarte({ sorte, choix, question, validation, revue }) {
  // La carte « Validate its screen » (ticket 3185) : deux gestes, valider ou renvoyer en cuisine.
  if (validation !== undefined) return "Design validation";
  // La carte « review before merge » d'un ticket sensible (ticket 3224) : merger, ou renvoyer avec une note.
  if (revue !== undefined) return "Review before merge";
  const options = `${choix.length} ${choix.length === 1 ? "option" : "options"}`;
  if (question === null || choix.length === 0) return "Review only you can make";
  // Une PR à merger à la main, mise de côté par la station ou d’un fork (tickets 3368, 3367) : un merge, pas un choix.
  if (sorte === "merge-by-hand") return `Merge by hand · ${options}`;
  if (sorte === "hold") return `Lift the hold · ${options}`;
  return `${sorte === "design" ? "Design choice" : "Product choice"} · ${options}`;
}

// Ce que le reste de l'app fait, en une ligne sous la liste : combien de projets cuisent, quand la vue le sait.
/** @param {number} cuisent */
export const AILLEURS = (cuisent) => `Elsewhere: ${cuisent} ${cuisent === 1 ? "project" : "projects"} cooking.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [classe] @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  if (classe !== undefined) pose.className = classe;
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'en-tête : « Awaiting you » et le nombre de cartes ; une flèche en 44 px ramène à la liste hors de la liste.
/** @param {Fabrique} doc @param {number} cartes @param {(() => void) | undefined} retour */
function entete(doc, cartes, retour) {
  const tete = cree(doc, "header", "entete-des-cartes");
  if (retour !== undefined) {
    const fleche = cree(doc, "button", "retour-aux-cartes");
    fleche.type = "button";
    fleche.ariaLabel = RETOUR;
    fleche.textContent = "‹";
    fleche.addEventListener("click", retour);
    tete.append(fleche);
  }
  const titre = cree(doc, "h2", undefined, TITRE);
  const nombre = cree(doc, "span", "nombre-de-cartes", compte(cartes));
  tete.append(titre, nombre);
  return tete;
}

// La liste : une carte par chose qui attend, d'un seul toucher (le bouton est la carte). `avis` : ce que la lecture des
// projets a de pire à dire (GitHub qui refuse le téléphone…), posé sous la liste. `ailleurs` : la ligne sous la liste.
/** @param {Fabrique} doc @param {{ cartes: Carte[], ailleurs?: string, avis?: any[], ouvrir: (carte: Carte) => void }} liste */
export function poserLaListe(doc, { cartes, ailleurs, avis = [], ouvrir }) {
  const corps = cree(doc, "div", "corps-des-cartes");
  corps.dataset.vu = "liste";
  corps.append(cree(doc, "p", "mot-des-cartes", cartes.length === 0 ? RIEN_N_ATTEND : EN_TETE));
  for (const carte of cartes) {
    const touche = cree(doc, "button", "carte-a-ouvrir");
    touche.type = "button";
    touche.dataset.ticket = String(carte.ticket);
    const haut = cree(doc, "span", "haut-de-carte");
    haut.append(cree(doc, "span", "numero-de-carte", `#${carte.ticket} · ${carte.projet}`), cree(doc, "span", undefined, carte.age));
    touche.append(haut, cree(doc, "span", "question-de-carte", carte.todo.question ?? carte.todo.resume ?? ""), cree(doc, "span", "genre-de-carte", genreDeLaCarte(carte.todo)));
    touche.addEventListener("click", () => ouvrir(carte));
    corps.append(touche);
  }
  corps.append(...avis);
  if (ailleurs !== undefined) corps.append(cree(doc, "p", "ailleurs", ailleurs));
  return [entete(doc, cartes.length, undefined), corps];
}

// La carte ouverte : son numéro et son projet, sa question, ce qui se passe, un bouton par choix — le premier, la réponse
// recommandée, rempli de l'accent —, puis le champ pour répondre dans ses mots et « Send ». Un choix est la réponse : rien
// d'autre n'est demandé. `refus` : ce qui a empêché l'envoi, en une ligne, le détail au survol ; la carte garde ses gestes.
/**
 * @param {Fabrique} doc
 * @param {{ carte: Carte, total: number, brouillon: string, enRoute: boolean, refus?: { dit: string, detail: string }, retour: () => void, ecrire: (texte: string) => void, repondre: (reponse: Reponse) => void }} vue
 */
export function poserLaCarte(doc, { carte, total, brouillon, enRoute, refus, retour, ecrire, repondre }) {
  const { todo } = carte;
  const corps = cree(doc, "div", "corps-des-cartes");
  corps.dataset.vu = "carte";
  corps.append(cree(doc, "span", "numero-de-carte", `#${carte.ticket} · ${carte.projet}`));
  // À première vue, dans l'ordre de la carte du bureau (ticket 3086) : ce qui se passe, en une ligne ; la question ; la réponse
  // recommandée ; les boutons. Le reste du commentaire est derrière « details », fermé.
  if (todo.question !== null && todo.resume !== undefined) corps.append(cree(doc, "p", "mot-des-cartes", todo.resume));
  corps.append(cree(doc, "h1", undefined, todo.question ?? todo.resume ?? ""));
  const [premier] = todo.choix;
  if (todo.question !== null && premier !== undefined) corps.append(cree(doc, "p", "mot-des-cartes recommandation", `${RECOMMANDEE}: ${premier.texte}`));
  todo.choix.forEach(({ texte, prix }, rang) => {
    const choix = bouton(doc, texte, () => repondre({ question: todo.question, choix: rang + 1 }), { sorte: rang === 0 ? "recommande" : "secondaire" });
    choix.className = `${choix.className} choix-du-chef`.trim();
    const cout = prixDit(prix);
    if (cout !== "") choix.title = cout;
    choix.disabled = enRoute;
    corps.append(choix);
  });
  const etiquette = cree(doc, "label", "mot-des-cartes", SON_MOT);
  etiquette.htmlFor = "reponse-du-chef";
  const saisie = cree(doc, "textarea", "saisie-du-chef");
  saisie.id = "reponse-du-chef";
  saisie.dataset.champ = CHAMP;
  saisie.rows = 3;
  saisie.value = brouillon;
  saisie.disabled = enRoute;
  const envoyer = bouton(doc, ENVOYER, () => repondre({ question: todo.question, texte: saisie.value }));
  envoyer.className = `${envoyer.className} envoi-du-chef`.trim();
  envoyer.disabled = enRoute || brouillon.trim() === "";
  saisie.addEventListener("input", () => {
    ecrire(saisie.value);
    envoyer.disabled = saisie.value.trim() === "";
  });
  corps.append(etiquette, saisie, envoyer);
  if (todo.contexte !== undefined) {
    const pli = cree(doc, "details", "details-de-la-carte");
    pli.append(cree(doc, "summary", undefined, DETAILS));
    for (const paragraphe of todo.contexte.split(/\n{2,}/)) pli.append(cree(doc, "p", "mot-des-cartes", paragraphe));
    corps.append(pli);
  }
  if (enRoute) corps.append(cree(doc, "p", "mot-des-cartes", EN_ROUTE));
  if (refus !== undefined) corps.append(ligneErreur(doc, refus.dit, refus.detail, { classe: "refus", alerte: true }));
  return Object.assign([entete(doc, total, retour), corps], { saisie });
}

// Une carte ouverte qui se pose ailleurs (la carte « Validate its screen », validation-design/, ticket 3185) : l'en-tête et le
// numéro de la carte ouverte, puis ce qu'elle pose.
/** @param {Fabrique} doc @param {{ carte: Carte, total: number, retour: () => void }} vue @param {any[]} elements */
export function poserLaCarteAPart(doc, { carte, total, retour }, elements) {
  const corps = cree(doc, "div", "corps-des-cartes");
  corps.dataset.vu = "carte";
  corps.append(cree(doc, "span", "numero-de-carte", `#${carte.ticket} · ${carte.projet}`), ...elements);
  return [entete(doc, total, retour), corps];
}

// L'envoi : la coche, « Sent to the kitchen. », et où en est le projet. `reste` : les cartes qui l'attendent encore sur lui.
/** @param {Fabrique} doc @param {{ ticket: number, projet: string, reste: number, total: number, retour: () => void }} vue */
export function poserLEnvoi(doc, { ticket, projet, reste, total, retour }) {
  const corps = cree(doc, "div", "corps-des-cartes");
  corps.dataset.vu = "envoyee";
  const coche = cree(doc, "span", "coche-d-envoi");
  coche.role = "img";
  coche.ariaLabel = "Sent";
  const suite = reste === 0 ? `Nothing else awaits you on ${projet}.` : `${compte(reste)} still ${reste === 1 ? "awaits" : "await"} you on ${projet}.`;
  const retourALaListe = bouton(doc, RETOUR, retour);
  retourALaListe.className = `${retourALaListe.className} envoi-du-chef`.trim();
  corps.append(coche, cree(doc, "h1", undefined, ENVOYEE), cree(doc, "p", "mot-des-cartes", `#${ticket} is back on the rail. ${suite}`), retourALaListe);
  return [entete(doc, total, retour), corps];
}
