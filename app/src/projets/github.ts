// Les dépôts GitHub du chef, lus par le `gh` du poste : ceux entre lesquels il
// choisit, dans le parcours « Add a project », celui à ajouter — chacun avec sa
// branche par défaut, proposée comme branche d'intégration.
import { execFile, type ExecFileException } from "node:child_process";

export type Reglages = { gh: string; delaiMs: number };
export type DepotDuChef = { depot: string; base: string };

const PAR_PAGE = 100;
const PAGES_MAX = 10;

function echec(reglages: Reglages, erreur: ExecFileException, erreurs: string): string {
  if (erreur.code === "ENOENT") return `\`${reglages.gh}\` is not on this machine: the app reads your repositories with your own \`gh\``;
  if (erreur.killed === true) return `GitHub gave no answer within ${Math.round(reglages.delaiMs / 1000)} s`;
  return erreurs.trim().split("\n").at(-1) || erreur.message;
}

function appelerGh(reglages: Reglages, chemin: string): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    execFile(reglages.gh, ["api", chemin], { windowsHide: true, timeout: reglages.delaiMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) =>
      erreur === null ? resoudre(sortie) : rejeter(new Error(echec(reglages, erreur, erreurs))),
    );
  });
}

// Les dépôts que le compte du `gh` peut lire, les plus récemment poussés d'abord ; ni les archivés, ni les forks.
// Ceux de ses organisations en sont : l'affiliation est dite en clair, `organization_member` compris, pour
// que la liste ne tienne pas à la valeur par défaut de GitHub.
export const AFFILIATION = "owner,collaborator,organization_member";

export function depotsDuChef(reglages: Reglages): () => Promise<DepotDuChef[]> {
  const appeler = (chemin: string) => appelerGh(reglages, chemin);
  return async () => {
    const depots: DepotDuChef[] = [];
    for (let page = 1; page <= PAGES_MAX; page++) {
      const lus = JSON.parse(await appeler(`/user/repos?affiliation=${AFFILIATION}&per_page=${PAR_PAGE}&page=${page}&sort=pushed`)) as Array<{ full_name?: unknown; default_branch?: unknown; archived?: unknown; fork?: unknown }>;
      if (!Array.isArray(lus)) throw new Error("the list of your repositories is not what GitHub returns");
      for (const { full_name, default_branch, archived, fork } of lus) {
        if (typeof full_name !== "string" || archived === true || fork === true) continue;
        depots.push({ depot: full_name, base: typeof default_branch === "string" ? default_branch : "main" });
      }
      if (lus.length < PAR_PAGE) break;
    }
    return depots;
  };
}

const FORME_DU_DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;

// Un dépôt lu par son nom, `owner/repo` — le sien, celui d'une organisation, ou un dépôt public qui n'est pas
// au chef — : sa branche par défaut, ou le refus en une phrase (inconnu, privé, illisible). Rien n'est écrit.
export function lireUnDepot(reglages: Reglages): (depot: unknown) => Promise<DepotDuChef | { refus: string }> {
  return async (depot) => {
    if (typeof depot !== "string" || !FORME_DU_DEPOT.test(depot)) return { refus: "that is not a repository name: owner/repo" };
    try {
      const lu = JSON.parse(await appelerGh(reglages, `/repos/${depot}`)) as { full_name?: unknown; default_branch?: unknown };
      if (typeof lu.full_name !== "string") return { refus: `${depot} is not a repository GitHub knows` };
      return { depot: lu.full_name, base: typeof lu.default_branch === "string" ? lu.default_branch : "main" };
    } catch (erreur) {
      const dit = erreur instanceof Error ? erreur.message : String(erreur);
      return { refus: /404|Not Found/i.test(dit) ? `${depot} was not found on GitHub, or it is private` : `${depot} could not be read on GitHub — ${dit}` };
    }
  };
}
