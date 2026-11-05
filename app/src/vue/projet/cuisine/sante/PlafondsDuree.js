// @ts-check
// Les plafonds de durée (ticket 2485, épique 2484) : l'emplacement du bloc « Duration caps ». Une coquille montée dans son onglet — un ticket
// suivant remplit ce fichier, et lui seul.

export const TITRE = "Duration caps";

/** @param {{ createElement: (balise: string) => HTMLElement }} doc */
export function poserBlocPlafondsDuree(doc) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "plafonds-duree";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  return bloc;
}
