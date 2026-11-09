// @ts-check
// Le bloc des projets de l'accueil (ticket 2638, épique 2497) : le premier des deux blocs de l'accueil, son titre avec
// « Add a project » à sa droite (Home.dc.html, ticket 2912), et dessous la vue d'ensemble des projets que la vue lui donne — une
// ligne par projet, posée par `poserAccueil`. Ce qu'il montre se change ici, sans toucher à l'assemblage de l'accueil
// dans vue.js.
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
  const entete = doc.createElement("div");
  entete.className = "entete-du-bloc";
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  const ajout = doc.createElement("span");
  ajout.className = "ajout-de-projet";
  entete.append(titre, ajout);
  racine.append(entete, contenu);
  return racine;
}

// Le bouton d'ajout, à droite du titre ; aucun, la place reste vide (un téléphone n'ajoute pas de projet).
/** @param {any} racine @param {any} [bouton] */
export function poserAjout(racine, bouton) {
  racine.children[0].children[1].replaceChildren(...(bouton === undefined ? [] : [bouton]));
}
