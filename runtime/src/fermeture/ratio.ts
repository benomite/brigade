// La dérive que la fermeture mesure : ce que les derniers merges ont ajouté,
// rapporté à ce qu'ils ont retiré. Rien ne retire quoi que ce soit tant que ce
// ratio ne redescend pas.

// Les fenêtres, en merges : les vingt, cinquante et cent derniers.
export const FENETRES = [20, 50, 100];

// `merges` : ceux que la fenêtre a trouvés — moins qu'elle n'en demande quand
// la branche n'en a pas autant.
export type Fenetre = { fenetre: number; merges: number; ajoute: number; retire: number };

// `merges` : le plus récent d'abord.
export function mesurerRatio(merges: Array<{ ajoute: number; retire: number }>, fenetres = FENETRES): Fenetre[] {
  return fenetres.map((fenetre) => {
    const siens = merges.slice(0, fenetre);
    const somme = (lire: (merge: { ajoute: number; retire: number }) => number) => siens.reduce((total, merge) => total + lire(merge), 0);
    return { fenetre, merges: siens.length, ajoute: somme(({ ajoute }) => ajoute), retire: somme(({ retire }) => retire) };
  });
}
