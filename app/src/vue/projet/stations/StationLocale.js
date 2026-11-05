// @ts-check
// La station locale (ticket 2485, épique 2484) : l'emplacement du bloc « Local station ». Une coquille montée dans son onglet — un ticket
// suivant remplit ce fichier, et lui seul.

export const TITRE = "Local station";

/** @param {{ createElement: (balise: string) => HTMLElement }} doc */
export function poserBlocStationLocale(doc) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "station-locale";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  return bloc;
}
