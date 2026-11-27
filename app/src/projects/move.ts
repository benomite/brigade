// Déménager la cuisine d'un projet depuis sa page, d'un geste : vers cet ordinateur, vers sa box,
// vers une autre station — sans le retirer ni le rajouter. L'app ne lance plus l'opération du runtime (elle n'en porte
// plus) : `demenager` des projets (projects.ts) reste absent tant qu'aucune station n'en offre le geste.

// `detail` : ce que la commande a écrit d'autre — il se lit au survol, jamais à plat.
export type Move = { demenage: { projet: string; de: string; vers: string } } | { refus: string; detail?: string };
// L'opération : le projet, le gist de la station visée, et ceux de toutes les stations du chef ;
// `de`, le gist de la station qui remet sa cuisine — celle où la page le dit cuire —, quand l'app la
// connaît : plusieurs stations servent un projet (#2713), le runtime ne devine pas laquelle part.
export type Mover = (project: string, to: string, gists: readonly string[], of?: string) => Promise<Move>;
