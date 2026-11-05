// @ts-check
// Le temps des tickets (ticket 2485, épique 2484) : l'emplacement du bloc « Ticket time ». Une coquille montée dans son onglet — un ticket
// suivant remplit ce fichier, et lui seul.

export const TITRE = "Ticket time";

/** @param {{ createElement: (balise: string) => HTMLElement }} doc */
export function poserBlocTempsTickets(doc) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "temps-tickets";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  return bloc;
}
