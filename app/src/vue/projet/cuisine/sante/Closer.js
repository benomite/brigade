// @ts-check
// Le closer (ticket 2485, épique 2484) : l'emplacement du bloc « Closer ». Une coquille montée dans son onglet — un ticket
// suivant remplit ce fichier, et lui seul.

export const TITRE = "Closer";

/** @param {{ createElement: (balise: string) => HTMLElement }} doc */
export function poserBlocCloser(doc) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "closer";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  return bloc;
}
