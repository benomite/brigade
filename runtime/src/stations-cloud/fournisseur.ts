// Le contrat d'un hôte de stations cloud (épique #2223) : GitHub étant le seul
// état de la cuisine, une station n'est qu'une machine qui prend des tickets
// sur GitHub. Un fournisseur sait en démarrer une pour un projet, l'arrêter, et
// dire lesquelles tournent — rien de plus. Ce qu'elle fait une fois démarrée
// (prendre, cuisiner, relire, merger) est celui de toute station, sous les
// mêmes gardes : le fournisseur n'en sait rien.
//
// Le compte chez l'hôte est celui de l'utilisateur : brigade ne facture rien.

// Une station cloud qui tourne. `nom` est celui sous lequel elle prend ses
// tickets et rend ses verdicts sur GitHub, comme toute station ; `depuis` dit
// quand l'hôte l'a démarrée (ISO 8601).
export type StationCloud = { id: string; projet: string; nom: string; depuis: string };

export type Fournisseur = {
  // Démarre une station pour le projet, et la rend telle qu'elle tourne.
  demarrer(projet: string): Promise<StationCloud>;
  // Arrête la station ; sans effet si elle ne tourne plus.
  arreter(id: string): Promise<void>;
  // Les stations du projet qui tournent.
  lister(projet: string): Promise<StationCloud[]>;
};

// Le préfixe du nom d'une station cloud : `cloud/<id>`, un nom que les
// marqueurs de prise et de verdict acceptent.
export const nomDeStationCloud = (id: string) => `cloud/${id}`;

// Un fournisseur en mémoire, pour les tests : rien ne tourne hors du process.
// `gestes` garde, dans l'ordre, chaque démarrage et chaque arrêt demandés.
export function fournisseurFactice(horloge: () => Date = () => new Date(0)) {
  const enCours = new Map<string, StationCloud>();
  const gestes: string[] = [];
  let suivant = 0;
  const fournisseur: Fournisseur = {
    async demarrer(projet) {
      const id = `c${++suivant}`;
      const station: StationCloud = { id, projet, nom: nomDeStationCloud(id), depuis: horloge().toISOString() };
      enCours.set(id, station);
      gestes.push(`demarrer ${projet} ${id}`);
      return { ...station };
    },
    async arreter(id) {
      gestes.push(`arreter ${id}`);
      enCours.delete(id);
    },
    async lister(projet) {
      return [...enCours.values()].filter((station) => station.projet === projet).map((station) => ({ ...station }));
    },
  };
  return { fournisseur, gestes };
}
