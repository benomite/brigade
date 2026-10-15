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

// Les dépôts que le compte du `gh` peut lire, les plus récemment poussés d'abord ; ni les archivés, ni les forks.
export function depotsDuChef(reglages: Reglages): () => Promise<DepotDuChef[]> {
  const appeler = (chemin: string): Promise<string> =>
    new Promise((resoudre, rejeter) => {
      execFile(reglages.gh, ["api", chemin], { timeout: reglages.delaiMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) =>
        erreur === null ? resoudre(sortie) : rejeter(new Error(echec(reglages, erreur, erreurs))),
      );
    });
  return async () => {
    const depots: DepotDuChef[] = [];
    for (let page = 1; page <= PAGES_MAX; page++) {
      const lus = JSON.parse(await appeler(`/user/repos?per_page=${PAR_PAGE}&page=${page}&sort=pushed`)) as Array<{ full_name?: unknown; default_branch?: unknown; archived?: unknown; fork?: unknown }>;
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
