// Les onglets de contenu d'un espace, en haut. Aucun ne lance de commande : l'app lit GitHub (#4710).

export type Tab = { id: string; titre: string; commande: string; precision?: string };

// Aucun onglet ne relaie plus une commande du runtime : l'onglet Log est parti avec la commande `log` (#4678).
export const TABS: readonly Tab[] = [];

// Ce que l'écran principal montre en haut : un onglet, Paramètres — une seule page, sans sous-pages
// (#1700) : ce que le chef règle, en trois groupes. Les
// pages Rail, Manager et General n'existent plus, ni leur lecture, ni l'onglet Cooks (#2921). Log n'a ni onglet ni bouton (#3048). Le coût n'est plus
// lu (#4509).
// `defaut` : la lecture que l'onglet ouvre — sans commande pour Paramètres.
export type Heading = { id: string; titre: string; defaut: string; lectures: readonly string[] };
export const PARAMETERS = "parametres";
export const HEADINGS: readonly Heading[] = [
  { id: PARAMETERS, titre: "Settings", defaut: PARAMETERS, lectures: [PARAMETERS] },
];
