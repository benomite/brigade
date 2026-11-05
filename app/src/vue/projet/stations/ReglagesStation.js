// @ts-check
// Les réglages d'une station (ticket 2485, épique 2484) : l'emplacement du bloc « Station settings ». Une coquille montée dans son onglet — un ticket
// suivant remplit ce fichier, et lui seul.

export const TITRE = "Station settings";

/** @param {{ createElement: (balise: string) => HTMLElement }} doc */
export function poserBlocReglagesStation(doc) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "reglages-station";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  return bloc;
}
