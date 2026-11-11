// Ce qu'un clone dit de lui-même, lu par le `git` du poste : le dépôt GitHub de son origine, et la
// branche que son origine désigne. L'écran « Add a project » ne demande plus ni dossier, ni dépôt, ni
// branche (#3181) : un projet s'ouvre d'un dépôt choisi (premier-lancement.ts), et c'est la branche de
// sa copie qui sert d'intégration quand GitHub n'a pas donné la sienne. Rien ne part ailleurs.
import { execFile } from "node:child_process";

// Un dépôt GitHub : `<owner>/<name>`, sans adresse ni `.git`.
const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCHE = /^[A-Za-z0-9._/-]{1,200}$/;

const depotRefuse = (depot: string) => !DEPOT.test(depot) || [".", ".."].includes(depot.split("/")[1] ?? "") || depot.endsWith(".git");

// Le dépôt qu'une origine désigne chez GitHub — rien, si ce n'est pas une adresse que l'app sait lire.
export function depotDe(origine: string): string | undefined {
  const [, depot] = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?(?:[^@/]+@)?github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(origine.trim()) ?? [];
  return depot === undefined || depotRefuse(depot) ? undefined : depot;
}

// La branche que l'origine désigne, telle que le clone l'a notée (`origin/main`) — rien, sinon.
export function brancheDe(sortie: string): string | undefined {
  const [, branche] = /^origin\/(.+)$/.exec(sortie.trim()) ?? [];
  return branche === undefined || !BRANCHE.test(branche) ? undefined : branche;
}

// Le dépôt et la branche d'un clone : ils se lisent, ils ne se devinent pas — sans origine lisible, rien.
export type Lu = { depot?: string; base?: string };

const git = (binaire: string, dossier: string, args: string[]) =>
  new Promise<string | undefined>((resoudre) => execFile(binaire, ["-C", dossier, ...args], { windowsHide: true, timeout: 10_000 }, (erreur, sortie) => resoudre(erreur === null ? sortie : undefined)));

// Le dépôt GitHub de l'origine d'un dossier — rien, sans origine lisible ou si ce n'est pas GitHub.
export async function depotDeLOrigine(binaire: string, dossier: string): Promise<string | undefined> {
  const origine = await git(binaire, dossier, ["remote", "get-url", "origin"]);
  return origine === undefined ? undefined : depotDe(origine);
}

export async function lireClone(binaire: string, dossier: string): Promise<Lu> {
  const [origine, tete] = await Promise.all([git(binaire, dossier, ["remote", "get-url", "origin"]), git(binaire, dossier, ["rev-parse", "--abbrev-ref", "origin/HEAD"])]);
  const depot = origine === undefined ? undefined : depotDe(origine);
  const base = tete === undefined ? undefined : brancheDe(tete);
  return { ...(depot === undefined ? {} : { depot }), ...(base === undefined ? {} : { base }) };
}
