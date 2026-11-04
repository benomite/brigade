// Le contrat d'un hôte de stations cloud (#2228, épique #2223) : avec GitHub
// pour seul état, une station n'est qu'une machine qui prend des tickets sur
// GitHub — elle peut donc tourner chez un hôte cloud, démarrée pour une salve de
// travail et arrêtée quand le rail est vide. L'utilisateur apporte son propre
// compte chez l'hôte ; brigade ne facture rien.
//
// Un hôte sait trois choses : démarrer une station pour un projet, l'arrêter,
// dire celles qui tournent. Il ne décide pas s'il faut en démarrer une : les
// plafonds du projet (`plafonds.ts`) le disent avant, à qui l'appelle. Les
// heures consommées se comptent sur `demarreeLe`, à l'horloge de l'hôte.
//
// `fauxFournisseur` tient les stations en mémoire, sans réseau ni compte : c'est
// celui des tests.

// Une station qui tourne chez l'hôte : `id` est celui que l'hôte lui a donné,
// le seul par lequel l'arrêter.
export type StationCloud = {
  id: string;
  projet: string;
  demarreeLe: Date;
};

export type FournisseurCloud = {
  // Le nom de l'hôte, tel qu'un message le montre.
  readonly nom: string;
  // Démarre une station pour `projet` et la rend une fois lancée.
  demarrer(projet: string): Promise<StationCloud>;
  // Arrête la station `id`. Arrêter une station déjà arrêtée, ou que l'hôte ne
  // connaît pas, n'est pas une erreur : l'arrêt se rejoue sans risque. Rend
  // `true` si elle tournait.
  arreter(id: string): Promise<boolean>;
  // Les stations qui tournent — celles de `projet` seulement, s'il est donné.
  lister(projet?: string): Promise<StationCloud[]>;
};

// Un hôte en mémoire. `maintenant` : l'heure d'un démarrage — celle de
// l'horloge, hors des tests.
export function fauxFournisseur({ nom = "faux", maintenant = () => new Date() }: { nom?: string; maintenant?: () => Date } = {}): FournisseurCloud {
  const enCours = new Map<string, StationCloud>();
  let suivant = 1;
  const copie = (station: StationCloud): StationCloud => ({ ...station, demarreeLe: new Date(station.demarreeLe) });
  return {
    nom,
    async demarrer(projet) {
      if (projet.trim() === "") throw new Error("a cloud station is started for a project: none given");
      const station = { id: `${nom}-${suivant++}`, projet, demarreeLe: new Date(maintenant()) };
      enCours.set(station.id, station);
      return copie(station);
    },
    async arreter(id) {
      return enCours.delete(id);
    },
    async lister(projet) {
      return [...enCours.values()].filter((station) => projet === undefined || station.projet === projet).map(copie);
    },
  };
}
