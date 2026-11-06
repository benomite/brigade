// @ts-check
// Le bloc des projets de l'accueil (ticket 2638, épique 2497) : le premier des deux blocs de l'accueil, son titre, et
// dessous la vue d'ensemble des projets que la vue lui donne — une ligne par projet, posée par `poserAccueil`. Ce qu'il
// montre se change ici, sans toucher à l'assemblage de l'accueil dans vue.js.
//
// Il ne touche pas `document` : la vue lui donne une fabrique (briques.js) et le contenu à poser.

/** @typedef {import("../../briques.js").Fabrique} Fabrique */

export const TITRE = "Projects";

/** @param {Fabrique} doc @param {any} contenu */
export function poserBlocDesProjets(doc, contenu) {
  const racine = doc.createElement("section");
  racine.id = "accueil-bloc-projets";
  racine.className = "bloc-de-l-accueil";
  racine.ariaLabel = TITRE;
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  racine.append(titre, contenu);
  return racine;
}
