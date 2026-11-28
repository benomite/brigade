// Déménager la cuisine d'un projet depuis sa page, d'un geste : vers cet ordinateur, vers sa box,
// vers une autre station — sans le retirer ni le rajouter. L'opération du runtime qui le faisait n'existe plus
// (#4712) : la page n'a pas d'opération à lancer, et elle refuse chaque déménagement (projects.ts).
//
// - **Déménagé** : la demande est écrite sur les deux stations ; le reste se fait entre elles, par
//   leurs gists, et le suivi de chacune dit où le projet cuit (projects.ts, `cuitSur`).
// - **Refusé** : la raison, en une phrase, et rien n'a changé.

// `detail` : ce que la commande a écrit d'autre — il se lit au survol, jamais à plat.
export type Move = { demenage: { projet: string; de: string; vers: string } } | { refus: string; detail?: string };
// L'opération : le projet, le gist de la station visée, et ceux de toutes les stations du chef ;
// `de`, le gist de la station qui remet sa cuisine — celle où la page le dit cuire —, quand l'app la
// connaît : plusieurs stations servent un projet (#2713), le runtime ne devine pas laquelle part.
export type Mover = (project: string, to: string, gists: readonly string[], of?: string) => Promise<Move>;
