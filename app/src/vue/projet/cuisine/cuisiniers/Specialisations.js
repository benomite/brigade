// @ts-check
// Les spécialisations (ticket 2485, épique 2484) : l'emplacement du bloc « Specializations ». Une coquille montée dans son onglet — un ticket
// suivant remplit ce fichier, et lui seul.

export const TITRE = "Specializations";

/** @param {{ createElement: (balise: string) => HTMLElement }} doc */
export function poserBlocSpecialisations(doc) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "specialisations";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  return bloc;
}
