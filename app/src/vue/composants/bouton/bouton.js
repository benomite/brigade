// @ts-check
// Le bouton de l'app (ticket 2916, maquette `Components.dc.html` de docs/maquettes/app/) : une seule famille, et
// chaque geste de chaque écran passe par ici. Quatre sortes — le recommandé, rempli de l'accent, un par endroit ; le
// secondaire, pour tout autre geste ; le discret, pour renoncer, fermer, replier ; le danger, pour arrêter ou retirer —,
// en 32 px de haut sur l'ordinateur, en 44 px à la largeur d'un téléphone et au premier lancement (`grand`, ou
// `data-boutons="grands"` sur l'écran qui les veut tous grands). Sa peau est dans `bouton.css`, à côté, qui ne lit que
// ces attributs : aucun écran ne dessine son bouton.
// La classe `recommande` reste sur le recommandé : c'est par elle que la vue et ses tests le reconnaissent.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

/** @typedef {"recommande" | "secondaire" | "discret" | "danger"} Sorte */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

/** @type {readonly Sorte[]} */
export const SORTES = ["recommande", "secondaire", "discret", "danger"];

// Un bouton : son libellé, son geste au clic (aucun pour un `submit`, que son formulaire écoute), sa sorte et sa taille.
/** @param {Fabrique} doc @param {string} libelle @param {(() => void) | undefined} geste @param {{ sorte?: Sorte, grand?: boolean, type?: "button" | "submit" }} [options] */
export function bouton(doc, libelle, geste, { sorte = "secondaire", grand = false, type = "button" } = {}) {
  const cree = doc.createElement("button");
  cree.type = type;
  cree.textContent = libelle;
  sorteDuBouton(cree, sorte);
  if (grand) cree.dataset.taille = "grand";
  if (geste !== undefined) cree.addEventListener("click", geste);
  return cree;
}

// Change la sorte d'un bouton déjà posé — un geste qui devient le recommandé, ou cesse de l'être.
/** @param {any} cree @param {Sorte} sorte */
export function sorteDuBouton(cree, sorte) {
  cree.dataset.bouton = sorte;
  cree.className = sorte === "recommande" ? "recommande" : "";
}
