// Les dépôts GitHub du chef, lus par le `gh` du poste : ceux entre lesquels il
// choisit, dans le parcours « Add a project », celui à ajouter — chacun avec sa
// branche par défaut, proposée comme branche d'intégration.
import { execFile, type ExecFileException } from "node:child_process";

export type Settings = { gh: string; delaiMs: number };
export type RepositoryOfChef = { depot: string; base: string };

const PAR_PAGE = 100;
const PAGES_MAX = 10;

function failure(settings: Settings, error: ExecFileException, errors: string): string {
  if (error.code === "ENOENT") return `\`${settings.gh}\` is not on this computer: the app reads your repositories with your own \`gh\``;
  if (error.killed === true) return `GitHub gave no answer within ${Math.round(settings.delaiMs / 1000)} s`;
  return errors.trim().split("\n").at(-1) || error.message;
}

function callGh(settings: Settings, path: string): Promise<string> {
  return new Promise((resolve, rejeter) => {
    execFile(settings.gh, ["api", path], { windowsHide: true, timeout: settings.delaiMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (error, output, errors) =>
      error === null ? resolve(output) : rejeter(new Error(failure(settings, error, errors))),
    );
  });
}

// Les dépôts que le compte du `gh` peut lire, les plus récemment poussés d'abord ; ni les archivés, ni les forks.
// Ceux de ses organisations en sont : l'affiliation est dite en clair, `organization_member` compris, pour
// que la liste ne tienne pas à la valeur par défaut de GitHub.
export const AFFILIATION = "owner,collaborator,organization_member";

export function repositoriesOfChef(settings: Settings): () => Promise<RepositoryOfChef[]> {
  const call = (path: string) => callGh(settings, path);
  return async () => {
    const repositories: RepositoryOfChef[] = [];
    for (let page = 1; page <= PAGES_MAX; page++) {
      const readOnes = JSON.parse(await call(`/user/repos?affiliation=${AFFILIATION}&per_page=${PAR_PAGE}&page=${page}&sort=pushed`)) as Array<{ full_name?: unknown; default_branch?: unknown; archived?: unknown; fork?: unknown }>;
      if (!Array.isArray(readOnes)) throw new Error("the list of your repositories is not what GitHub returns");
      for (const { full_name, default_branch, archived, fork } of readOnes) {
        if (typeof full_name !== "string" || archived === true || fork === true) continue;
        repositories.push({ depot: full_name, base: typeof default_branch === "string" ? default_branch : "main" });
      }
      if (readOnes.length < PAR_PAGE) break;
    }
    return repositories;
  };
}

export const SHAPE_OF_REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;

// Un dépôt lu par son nom, `owner/repo` — le sien, celui d'une organisation, ou un dépôt public qui n'est pas
// au chef — : sa branche par défaut, ou le refus en une phrase (inconnu, privé, illisible). Rien n'est écrit.
export function readOneRepository(settings: Settings): (repository: unknown) => Promise<RepositoryOfChef | { refus: string }> {
  return async (repository) => {
    if (typeof repository !== "string" || !SHAPE_OF_REPOSITORY.test(repository) || repository.endsWith("/.") || repository.endsWith("/..")) return { refus: "that is not a repository name: owner/repo" };
    try {
      const readOne = JSON.parse(await callGh(settings, `/repos/${repository}`)) as { full_name?: unknown; default_branch?: unknown };
      if (typeof readOne.full_name !== "string") return { refus: `${repository} is not a repository GitHub knows` };
      return { depot: readOne.full_name, base: typeof readOne.default_branch === "string" ? readOne.default_branch : "main" };
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error);
      return { refus: /404|Not Found/i.test(said) ? `${repository} was not found on GitHub, or it is private` : `${repository} could not be read on GitHub — ${said}` };
    }
  };
}
