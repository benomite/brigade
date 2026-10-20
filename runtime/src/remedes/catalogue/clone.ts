// `clone-missing` : la station n'a plus de copie du dépôt du projet. Le
// remède la reclone, par le `gh` de la machine, au lieu qu'elle attende une
// copie que personne ne refait.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cloner } from "../../projets/preparer.ts";
import { CONFIGURATION, lireFichierDeConfiguration, lieuxDuProjet } from "../../station/configuration.ts";
import type { Remede } from "../registre.ts";

export type OptionsDuClone = {
  // Le clonage ; par défaut, celui de la station (`gh repo clone`).
  cloner?: (depot: string, clone: string, gh: string) => Promise<void>;
};

export const remedeDuClone = (options: OptionsDuClone = {}): Remede => ({
  id: "clone-repository-again",
  leve: ["clone-missing"],
  description: "Fetches the project's repository from GitHub again, to give the station its copy back.",
  destructif: false,
  async executer({ projet, racine, env, relireLaConfiguration }) {
    const ligne = lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets.find(({ nom }) => nom === projet);
    if (ligne === undefined) throw new Error("the station's configuration has no line for this project, so it does not know which repository to fetch");
    const { clone } = lieuxDuProjet(racine, projet, env.HOME);
    if (existsSync(clone)) throw new Error("the station's copy of the repository is back already");
    const gh = env.BRIGADE_GH_BIN || "gh";
    await (options.cloner ?? ((depot, aCloner, bin) => cloner({ gh: bin, depot, clone: aCloner })))(ligne.depot, clone, gh);
    relireLaConfiguration();
  },
});
