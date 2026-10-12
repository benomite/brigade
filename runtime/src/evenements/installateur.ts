// Ce que le geste d'installation de la box journalise : chaque appel, accepté
// ou refusé. Il tourne en root, hors de tout projet : son journal est à la box
// (`installateur.ts`), pas à un projet. L'enveloppe porte qui (`author`, le
// compte appelant), quand (`at`) et quel projet (`project`).

// Ce que l'appelant a tapé, borné : ni un contenu de fichier ni une ligne sans
// fin n'entrent au journal en entier.
export type AppelDInstallateur = {
  // La sous-commande tapée, ou null s'il n'y en avait pas.
  action: string | null;
  // Les arguments, tels que reçus — chacun coupé, et leur nombre aussi.
  args: string[];
};

export type FaitInstallateur =
  // Un appel accepté, écrit avant le premier geste sur la box : ce qui suit
  // dit ce qu'il est devenu. Sans suite, le geste a été coupé net.
  | { type: "installer.started"; payload: AppelDInstallateur & { result: "started" } }
  // Il a abouti. `ports` : celui qu'il a attribué à la porte du projet, et
  // celui de l'arbitre de la box, lu — null si la box n'en a pas.
  | { type: "installer.used"; payload: AppelDInstallateur & { result: "installed"; ports: { porte: number; arbitre: number | null } } }
  // Il n'a pas abouti. `undone` : tout ce qu'il avait posé a été retiré.
  | { type: "installer.failed"; payload: AppelDInstallateur & { result: "failed"; reason: string; undone: boolean } }
  // Un appel refusé : rien n'a été écrit sur la box. `reason` : le motif.
  | { type: "installer.refused"; payload: AppelDInstallateur & { result: "refused"; reason: string } };
