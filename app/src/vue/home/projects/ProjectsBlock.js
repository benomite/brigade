// @ts-check
// Le bloc des projets de l'accueil (ticket 2638, épique 2497) : le premier des deux blocs de l'accueil, son titre avec
// « Add a project » à sa droite (Home.dc.html, ticket 2912), et dessous la vue d'ensemble des projets que la vue lui donne — une
// ligne par projet, posée par `poserAccueil`. Ce qu'il montre se change ici, sans toucher à l'assemblage de l'accueil
// dans vue.js.
//
// Il ne touche pas `document` : la vue lui donne une fabrique (bricks.js) et le contenu à poser.

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */

export const TITLE = "Projects";

/** @param {Fabrique} doc @param {any} content */
export function setBlockOfProjects(doc, content) {
  const root = doc.createElement("section");
  root.id = "accueil-bloc-projets";
  root.className = "bloc-de-l-accueil";
  root.ariaLabel = TITLE;
  const header = doc.createElement("div");
  header.className = "entete-du-bloc";
  const title = doc.createElement("h2");
  title.textContent = TITLE;
  const addition = doc.createElement("span");
  addition.className = "ajout-de-projet";
  header.append(title, addition);
  root.append(header, content);
  return root;
}

// Le bouton d'ajout, à droite du titre ; aucun, la place reste vide (un téléphone n'ajoute pas de projet).
/** @param {any} root @param {any} [button] */
export function setAddition(root, button) {
  root.children[0].children[1].replaceChildren(...(button === undefined ? [] : [button]));
}
