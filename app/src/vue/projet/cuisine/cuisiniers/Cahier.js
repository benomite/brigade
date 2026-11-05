// @ts-check
// Le cahier (ticket 2493, épique 2484) : le bloc « Notebook » de Kitchen > Cooks — le cahier de leçons du projet, en lecture seule,
// entrée par entrée. Le cahier du projet est celui de son dépôt : ses leçons promues, lues dans `facts` (apprentissage.ts) ;
// les provisoires n'y sont pas encore, elles restent dans « what the cooks learned ». Sans entrée, une ligne le dit. Rien ici ne se
// clique : ouvrir une ligne sur GitHub est le geste de « what the cooks learned ». Ce module ne touche pas `document` : il
// reçoit de quoi créer un élément (briques.js) et rend le bloc.

export const TITRE = "Notebook";
export const VIDE = "No lesson in the notebook yet";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../apprentissage.ts").Lecon} Lecon */

// Une date du runtime (AAAA-MM-JJ), le jour lui-même quel que soit le fuseau.
const jour = (/** @type {string} */ date) => {
  const instant = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(instant) ? date : new Date(instant).toLocaleDateString("en-US", { timeZone: "UTC" });
};

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} texte */
function noeud(doc, balise, classe, texte) {
  const n = doc.createElement(balise);
  n.className = classe;
  n.textContent = texte;
  return n;
}

/** @param {Fabrique} doc @param {readonly Lecon[] | undefined} lecons les leçons du projet, `undefined` tant que ses faits ne sont pas lus */
export function poserBlocCahier(doc, lecons) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "cahier";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  const entrees = (lecons ?? []).filter((lecon) => lecon.statut === "promue");
  if (entrees.length === 0) {
    bloc.append(noeud(doc, "p", "cahier-vide", VIDE));
    return bloc;
  }
  const liste = doc.createElement("ol");
  liste.className = "cahier-entrees";
  for (const lecon of entrees) {
    const entree = doc.createElement("li");
    entree.className = "cahier-entree";
    entree.append(noeud(doc, "code", "id mono", lecon.id), noeud(doc, "span", "texte", lecon.texte), noeud(doc, "small", "depuis", `since ${jour(lecon.date)}`));
    liste.append(entree);
  }
  bloc.append(liste);
  return bloc;
}
