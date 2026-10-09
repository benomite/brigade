// Les faits de la cloison : ce qui sépare les lancements d'un projet du reste
// de la machine, et ce que le réseau du projet laisse passer.

// `sandbox` : nul, aucun lancement n'est cloisonné. `proxy` : nul, le réseau
// est ouvert. `enforced` : une connexion directe, tentée au démarrage, a été
// refusée par l'unité (true), a abouti ou est restée sans réponse (false) —
// null si rien n'a pu être éprouvé.
export type EtatDeCloison = {
  sandbox: { bin: string; hidden: string[]; credentials: string } | null;
  proxy: { port: number; enforced: boolean | null } | null;
};

export type FaitCloison =
  // L'état de la cloison, écrit par le runtime au démarrage quand il change.
  | { type: "isolation.configured"; payload: EtatDeCloison }
  // Les hôtes que le dépôt déclare sur sa branche d'intégration, écrits quand
  // ils changent : la porte lit sa liste ici. `problems` : les lignes de la
  // déclaration qui n'ouvrent rien.
  | { type: "network.declared"; payload: { base: string; hosts: string[]; problems: string[] } }
  // La porte a refusé une sortie. Un événement par hôte et par dix minutes au
  // plus ; `count` : les tentatives depuis le précédent.
  | { type: "network.refused"; payload: { host: string; port: number; count: number } };
