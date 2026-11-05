// @ts-check
// La bande du rail (ticket 2485, épique 2484) : l'emplacement du bloc « The rail band ». Une coquille montée dans son onglet — un ticket
// suivant remplit ce fichier, et lui seul.

export const TITRE = "The rail band";

/** @param {{ createElement: (balise: string) => HTMLElement }} doc */
export function poserBlocBandeRail(doc) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "bande-rail";
  bloc.ariaLabel = TITRE;
  // Vide tant qu'aucun ticket ne la remplit : la bande ne prend aucune place sur Rail.
  return bloc;
}
