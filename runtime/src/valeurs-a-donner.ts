// Ce que l'utilisateur doit donner pour que le runtime démarre, et que rien ne
// peut deviner pour lui : le projet, son dépôt GitHub (compte et dépôt), son
// clone, le répertoire où vit son état. Aucune de ces valeurs n'a de défaut —
// un défaut serait celui de quelqu'un d'autre. Au démarrage, toutes celles qui
// manquent sont dites ensemble, en anglais simple, avec ce qu'il faut écrire.
const A_DONNER: { variable: string; quoi: string }[] = [
  { variable: "BRIGADE_STATE_DIR", quoi: "the folder where brigade keeps its state for this project (the journal, the lock, the runs), outside the project's clone — for example /var/lib/brigade/<project>" },
  { variable: "BRIGADE_PROJECT", quoi: "the name of your project, a short word of your choice — for example my-app" },
  { variable: "BRIGADE_GITHUB_REPO", quoi: "the GitHub repository of your project, as <owner>/<repo> — the GitHub account or organisation that owns it, then its name" },
  { variable: "BRIGADE_REPO_DIR", quoi: "the folder of the clone of that repository that brigade is allowed to use, on this machine" },
];

// Les lignes qui disent ce qui manque ; vide quand tout est donné.
export function valeursManquantes(env: NodeJS.ProcessEnv): string[] {
  return A_DONNER.filter(({ variable }) => !env[variable]).map(({ variable, quoi }) => `${variable} is not set: give ${quoi}`);
}

export function direValeursManquantes(manquantes: string[]): string {
  return `${manquantes.length === 1 ? "a value" : `${manquantes.length} values`} to give before it can start — brigade has no default for what belongs to you:\n${manquantes.map((ligne) => `  - ${ligne}`).join("\n")}`;
}
