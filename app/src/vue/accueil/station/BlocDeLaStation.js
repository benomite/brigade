// @ts-check
// Le bloc de la station de cet ordinateur, sur l'accueil (ticket 2638, épique 2497) : le second des deux blocs de
// l'accueil. Pour l'heure, sa place et son titre seulement : son contenu est celui des tickets suivants de l'épique, qui
// le posent ici, sans toucher à l'assemblage de l'accueil dans vue.js. Vide, sa carte ne se voit pas.
//
// Il ne touche pas `document` : la vue lui donne une fabrique (briques.js).

/** @typedef {import("../../briques.js").Fabrique} Fabrique */

export const TITRE = "This computer's station";

/** @param {Fabrique} doc */
export function poserBlocDeLaStation(doc) {
  const racine = doc.createElement("section");
  racine.id = "accueil-bloc-station";
  racine.className = "bloc-de-l-accueil";
  racine.ariaLabel = TITRE;
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  const corps = doc.createElement("div");
  corps.className = "liste";
  corps.hidden = true;
  racine.append(titre, corps);
  return racine;
}
