// @ts-check
// Le cahier (ticket 2485, épique 2484) : l'emplacement du bloc « Notebook ». Une coquille montée dans son onglet — un ticket
// suivant remplit ce fichier, et lui seul.

export const TITRE = "Notebook";

/** @param {{ createElement: (balise: string) => HTMLElement }} doc */
export function poserBlocCahier(doc) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "cahier";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  return bloc;
}
