// @ts-check
// Les briques communes de la vue : ce que l'app dit moins, et dit pareil partout. Une explication
// ne s'écrit pas à plat dans l'écran, elle se montre au survol ou au focus clavier d'une icône
// d'aide ; une lecture qui manque tient en une ligne (composants/ligne-erreur), son détail technique dans le survol ;
// un bouton recommandé se distingue des autres, et son prix, s'il en a un, est dans son survol ;
// la confirmation d'un geste est dans composants/confirmation.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien
// et les tests un faux. Il ne pose rien dans la page, et ne câble aucun écran : il rend des éléments. Ses boutons sont
// ceux de la famille unique (composants/bouton, ticket 2916).

import { bouton } from "./composants/bouton/bouton.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Un prix « nul ou absent » : rien, 0, ou un texte vide. Ni survol ni ligne n'en naissent.
/** @param {unknown} prix @returns {string} */
export function prixDit(prix) {
  if (typeof prix === "number") return prix > 0 ? String(prix) : "";
  return typeof prix === "string" ? prix.trim() : "";
}

// La réponse qu'une carte de TODO recommande (#3434) : le rang de son choix, à partir de 1, et pourquoi en une ligne — nul
// quand elle ne le dit pas. Une carte qui ne dit rien de sa recommandation recommande son premier choix (ticket 2922) ; celle
// qui dit n'en recommander aucune (un écart du manager sans fondement pour en recommander une) n'en met aucune en avant. Rien
// sans question ni choix.
/**
 * @param {{ question: string | null, choix: { texte: string }[], recommandation?: { rang: number, pourquoi: string } | null }} carte
 * @returns {{ rang: number, texte: string, pourquoi: string | null } | null}
 */
export function recommandationDe({ question, choix, recommandation }) {
  if (question === null || recommandation === null) return null;
  const rang = recommandation === undefined ? 1 : recommandation.rang;
  const pris = choix[rang - 1];
  return pris === undefined ? null : { rang, texte: pris.texte, pourquoi: recommandation?.pourquoi ?? null };
}

// Le survol : un déclencheur (une icône « ? » par défaut) et, à côté, le texte — posé quand le
// pointeur ou le clavier arrive, retiré quand il part. Hors survol, le texte n'est nulle part dans
// l'élément : il n'est pas caché, il n'y est pas. Il reste lisible à qui ne voit pas l'écran, par
// le nom accessible du déclencheur.
/** @param {Fabrique} doc @param {string} texte @param {any} [declencheur] */
export function survol(doc, texte, declencheur) {
  const racine = doc.createElement("span");
  racine.className = "survol";
  const cible = declencheur ?? doc.createElement("button");
  if (declencheur === undefined) {
    cible.type = "button";
    cible.className = "aide";
    cible.textContent = "?";
  }
  cible.ariaLabel = texte;
  racine.append(cible);
  /** @type {any} */
  let bulle;
  const montrer = () => {
    if (bulle !== undefined) return;
    bulle = doc.createElement("span");
    bulle.className = "bulle";
    bulle.role = "tooltip";
    bulle.textContent = texte;
    racine.append(bulle);
  };
  const cacher = () => {
    bulle?.remove();
    bulle = undefined;
  };
  for (const [evenement, geste] of /** @type {const} */ ([["mouseenter", montrer], ["focus", montrer], ["mouseleave", cacher], ["blur", cacher]])) {
    racine.addEventListener(evenement, geste);
    cible.addEventListener(evenement, geste);
  }
  // Échap ferme, comme pour tout survol.
  racine.addEventListener("keydown", (/** @type {{ key?: string }} */ evenement) => {
    if (evenement.key === "Escape") cacher();
  });
  return racine;
}

// Un bouton d'action. `recommande` le distingue des autres (la sorte recommandée de la famille, et `aria-` de rien
// d'autre : c'est une question de peau) ; `sorte` en choisit une autre (discret, danger). `prix` : nul ou absent, il
// n'y a ni survol ni icône ; sinon le prix est dans le survol, pas écrit sous le bouton. `coupe` : son libellé tient sur
// une ligne, coupé, entier au survol (la famille, `bouton.js`).
/** @param {Fabrique} doc @param {string} libelle @param {() => void} geste @param {{ recommande?: boolean, sorte?: import("./composants/bouton/bouton.js").Sorte, grand?: boolean, coupe?: boolean, prix?: number | string | null }} [options] */
export function boutonAction(doc, libelle, geste, { recommande = false, sorte, grand = false, coupe = false, prix } = {}) {
  const groupe = doc.createElement("span");
  groupe.className = "action";
  groupe.append(bouton(doc, libelle, geste, { sorte: recommande ? "recommande" : sorte, grand, coupe }));
  const cout = prixDit(prix);
  if (cout !== "") groupe.append(survol(doc, cout));
  return groupe;
}

// Une case à cocher nommée (ticket 1307, reprise par le ticket 1510) : ce qu'elle coche, et dessous, s'il y a quoi, ce
// qui le dit en plus. `mono` : son nom est un mot de la machine, écrit tel qu'il se déclare (`navigateur-headless`).
// `changer` reçoit l'état de la case à chaque clic.
/** @param {Fabrique} doc @param {{ nom: string, dit: string, cochee: boolean, mono?: boolean }} quoi @param {(cochee: boolean) => void} changer */
export function caseACocher(doc, { nom, dit, cochee, mono = false }, changer) {
  const racine = doc.createElement("label");
  racine.className = "capacite";
  const coche = doc.createElement("input");
  coche.type = "checkbox";
  coche.checked = cochee;
  coche.ariaLabel = nom;
  coche.addEventListener("change", () => changer(coche.checked === true));
  const appele = doc.createElement("span");
  appele.textContent = nom;
  if (mono) appele.className = "mono";
  racine.append(coche, appele);
  if (dit !== "") {
    const note = doc.createElement("small");
    note.textContent = dit;
    racine.append(note);
  }
  return racine;
}

// Un bloc replié derrière une ligne (ticket 1456) : ce qui sert rarement — une lecture brute, un historique, un
// réglage — se montre fermé, sa ligne disant son titre et, en quelques mots, ce qu'il contient ; l'ouvrir montre le
// reste. `ouvert` : ce que le chef en a laissé — la vue le retient d'une lecture à l'autre, que le bloc reposé ne se
// referme pas sous ses yeux ; `basculer` le lui dit. `aide` : ce qu'il est, au survol de sa ligne.
/** @param {Fabrique} doc @param {{ titre: string, resume: string, aide?: string, ouvert?: boolean, basculer?: (ouvert: boolean) => void }} ligne @param {any[]} contenu */
export function replie(doc, { titre, resume, aide, ouvert = false, basculer }, contenu) {
  const racine = doc.createElement("details");
  racine.className = "replie";
  racine.open = ouvert;
  const tete = doc.createElement("summary");
  if (aide !== undefined) tete.title = aide;
  tete.append(...titreEtResume(doc, titre, resume));
  racine.append(tete, ...contenu);
  racine.addEventListener("toggle", () => basculer?.(racine.open === true));
  return racine;
}

// Un bloc qui n'a rien à dire — tout à zéro, rien en cours — tient en une ligne, pas un tableau (ticket 1456) : son
// titre, et ce qu'il dirait, en mots.
/** @param {Fabrique} doc @param {string} titre @param {string} dit */
export function uneLigne(doc, titre, dit) {
  const racine = doc.createElement("p");
  racine.className = "une-ligne";
  racine.append(...titreEtResume(doc, titre, dit));
  return racine;
}

/** @param {Fabrique} doc @param {string} titre @param {string} resume */
function titreEtResume(doc, titre, resume) {
  const nom = doc.createElement("strong");
  nom.textContent = titre;
  const dit = doc.createElement("span");
  dit.className = "resume";
  dit.textContent = resume;
  return [nom, dit];
}
