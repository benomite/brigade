// Le dépôt choisi dans le parcours « Add a project » est-il prêt pour brigade, et le geste qui l'y prépare (#2627) :
// le contrat du runtime (#2626, `runtime/src/depot-prepare/preparation.ts`), `checkRepoSetup` et `runRepoSetup`,
// joué sur la copie locale du dépôt — celle que l'app tient pour lui sur cet ordinateur, reprise si elle existe,
// clonée sinon (`projets/copie-locale.ts`). C'est là que `/brigade:init` travaille : la section des bindings s'écrit
// dans le `CLAUDE.md` de cette copie, les labels sur GitHub.
//
// Rendu à la vue : le constat `{ ready, missingBindings, missingLabels }`, ou `{ refus }` — une phrase, celle du
// runtime ou de la copie qui n'a pas pu se faire. Le préchargement fait du refus un rejet : la vue le dit et propose
// « try again ».
import type { CopieLocale } from "../../../runtime/src/projets/copie-locale.ts";
import type { Repo, RepoSetup } from "../../../runtime/src/depot-prepare/preparation.ts";
import { FORME_DU_REPOSITORY } from "./github.ts";

export type Constat = RepoSetup | { refus: string };
export type Contract = { checkRepoSetup(repo: Repo): Promise<RepoSetup>; runRepoSetup(repo: Repo): Promise<RepoSetup> };

export type Dependances = {
  // La copie locale du dépôt `owner/repo` sur cet ordinateur.
  ouvrirLaCopie: (repository: string) => Promise<CopieLocale>;
  // La branche de cette copie : celle que la section des bindings déclare, quand elle l'écrit.
  lireLaBase: (dossier: string) => Promise<string | undefined>;
  // Le contrat du runtime, chargé de celui qui est à côté de l'app.
  contrat: () => Promise<Contract>;
};

const phrase = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function preparationDuRepository({ ouvrirLaCopie, lireLaBase, contrat: contract }: Dependances): { verifier: (repository: unknown) => Promise<Constat>; installer: (repository: unknown) => Promise<Constat> } {
  const jouer = (action: keyof Contract) => async (repository: unknown): Promise<Constat> => {
    if (typeof repository !== "string" || !FORME_DU_REPOSITORY.test(repository)) return { refus: "That is not a repository name: owner/repo." };
    try {
      const copie = await ouvrirLaCopie(repository);
      if (copie.state === "failed") return { refus: copie.reason };
      const base = await lireLaBase(copie.folder).catch(() => undefined);
      return await (await contract())[action]({ dir: copie.folder, github: repository, ...(base ? { branch: base } : {}) });
    } catch (error) {
      return { refus: phrase(error) };
    }
  };
  return { verifier: jouer("checkRepoSetup"), installer: jouer("runRepoSetup") };
}
