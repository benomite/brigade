// Le dépôt choisi dans le parcours « Add a project » est-il prêt pour brigade, et le geste qui l'y prépare (#2627) :
// le contrat de préparation (#2626), `checkRepoSetup` et `runRepoSetup`, que le process principal charge, joué sur
// la copie locale du dépôt — celle que l'app tient pour lui sur cet ordinateur, reprise si elle existe, clonée sinon. C'est là que `/brigade:init` travaille : la section des bindings s'écrit
// dans le `CLAUDE.md` de cette copie, les labels sur GitHub.
//
// Rendu à la vue : le constat `{ ready, missingBindings, missingLabels }`, ou `{ refus }` — une phrase, celle du
// runtime ou de la copie qui n'a pas pu se faire. Le préchargement fait du refus un rejet : la vue le dit et propose
// « try again ».
import type { LocalCopy } from "../first-launch.ts";
import { SHAPE_OF_REPOSITORY } from "./github.ts";

// Le dépôt à préparer, sa copie et sa branche ; et ce que le contrat en constate.
export type Repo = { dir: string; github: string; branch?: string };
export type RepoSetup = { ready: boolean; missingBindings: boolean; missingLabels: string[] };

export type Finding = RepoSetup | { refus: string };
export type Contract = { checkRepoSetup(repo: Repo): Promise<RepoSetup>; runRepoSetup(repo: Repo): Promise<RepoSetup> };

export type Dependencies = {
  // La copie locale du dépôt `owner/repo` sur cet ordinateur.
  ouvrirLaCopie: (repository: string) => Promise<LocalCopy>;
  // La branche de cette copie : celle que la section des bindings déclare, quand elle l'écrit.
  lireLaBase: (folder: string) => Promise<string | undefined>;
  // Le contrat du runtime, chargé de celui qui est à côté de l'app.
  contrat: () => Promise<Contract>;
};

const sentence = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function preparationOfRepository({ ouvrirLaCopie: openTheCopy, lireLaBase: readTheBase, contrat: contract }: Dependencies): { verifier: (repository: unknown) => Promise<Finding>; installer: (repository: unknown) => Promise<Finding> } {
  const play = (action: keyof Contract) => async (repository: unknown): Promise<Finding> => {
    if (typeof repository !== "string" || !SHAPE_OF_REPOSITORY.test(repository)) return { refus: "That is not a repository name: owner/repo." };
    try {
      const copy = await openTheCopy(repository);
      if (copy.state === "failed") return { refus: copy.reason };
      const base = await readTheBase(copy.folder).catch(() => undefined);
      return await (await contract())[action]({ dir: copy.folder, github: repository, ...(base ? { branch: base } : {}) });
    } catch (error) {
      return { refus: sentence(error) };
    }
  };
  return { verifier: play("checkRepoSetup"), installer: play("runRepoSetup") };
}
