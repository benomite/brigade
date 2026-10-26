// Pourquoi une station installée ne cuit pas encore, en une phrase qui nomme le geste du chef (#1758) : une
// pastille grise ne reste jamais sans explication. Chaque raison a une clé, et sa phrase — ce que le chef clique
// ou lance — est dite ici, en un seul endroit ; la home la montre sur la ligne de la station.
// Hors ligne, illisible, sans projet : c'est l'app qui les lit sur la station. Une station ajoutée à un projet
// mais pas atteinte, c'est la principale du projet qui le dit, avec son geste (runtime/src/projets/secondaires.ts).
export type RaisonDeStation = { cle: "hors-ligne" | "illisible" | "sans-projet"; phrase: string };

export const RAISONS = {
  "hors-ligne": (nom: string) => `not reached: start Brigade on ${nom}'s computer, this line turns green when it signs again`,
  illisible: (nom: string) => `cannot be read: open ${nom}'s page and remove it, then pair it again with a new code`,
  "sans-projet": (nom: string) => `not added to any project: add a project to ${nom} with “+” in the bar`,
} as const satisfies Record<RaisonDeStation["cle"], (nom: string) => string>;

export const raisonDe = (cle: RaisonDeStation["cle"], nom: string): RaisonDeStation => ({ cle, phrase: RAISONS[cle](nom) });
