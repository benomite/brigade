// Ce qu'un clone dit de lui-même, lu par le `git` du poste : le dépôt GitHub de son origine, et la
// branche que son origine désigne. L'écran « Add a project » ne demande plus ni dossier, ni dépôt, ni
// branche (#3181) : un projet s'ouvre d'un dépôt choisi (first-launch.ts), et c'est la branche de
// sa copie qui sert d'intégration quand GitHub n'a pas donné la sienne. Rien ne part ailleurs.
import { execFile } from "node:child_process";

// Un dépôt GitHub : `<owner>/<name>`, sans adresse ni `.git`.
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;

const repositoryRefuses = (repository: string) => !REPOSITORY.test(repository) || [".", ".."].includes(repository.split("/")[1] ?? "") || repository.endsWith(".git");

// Le dépôt qu'une origine désigne chez GitHub — rien, si ce n'est pas une adresse que l'app sait lire.
export function repositoryOf(origin: string): string | undefined {
  const [, repository] = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?(?:[^@/]+@)?github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(origin.trim()) ?? [];
  return repository === undefined || repositoryRefuses(repository) ? undefined : repository;
}

// La branche que l'origine désigne, telle que le clone l'a notée (`origin/main`) — rien, sinon.
export function branchOf(output: string): string | undefined {
  const [, branch] = /^origin\/(.+)$/.exec(output.trim()) ?? [];
  return branch === undefined || !BRANCH.test(branch) ? undefined : branch;
}

// Le dépôt et la branche d'un clone : ils se lisent, ils ne se devinent pas — sans origine lisible, rien.
export type Read = { depot?: string; base?: string };

const git = (binary: string, folder: string, args: string[]) =>
  new Promise<string | undefined>((resolve) => execFile(binary, ["-C", folder, ...args], { windowsHide: true, timeout: 10_000 }, (error, output) => resolve(error === null ? output : undefined)));

// Le dépôt GitHub de l'origine d'un dossier — rien, sans origine lisible ou si ce n'est pas GitHub.
export async function repositoryOfTheOrigin(binary: string, folder: string): Promise<string | undefined> {
  const origin = await git(binary, folder, ["remote", "get-url", "origin"]);
  return origin === undefined ? undefined : repositoryOf(origin);
}

export async function readClone(binary: string, folder: string): Promise<Read> {
  const [origin, head] = await Promise.all([git(binary, folder, ["remote", "get-url", "origin"]), git(binary, folder, ["rev-parse", "--abbrev-ref", "origin/HEAD"])]);
  const repository = origin === undefined ? undefined : repositoryOf(origin);
  const base = head === undefined ? undefined : branchOf(head);
  return { ...(repository === undefined ? {} : { depot: repository }), ...(base === undefined ? {} : { base }) };
}
