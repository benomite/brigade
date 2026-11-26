// La commande `human-cooks` (#4276) : la liste des tickets qui attendent un cook
// humain, lue sur GitHub — une ligne par ticket ouvert marqué `human-cook`, avec
// qui le tient —, puis l'adresse de la même liste sur GitHub.
//
//   npm --prefix runtime run human-cooks
import { configRail } from "../alimenter.ts";
import { Sortie, type Appel } from "../appel.ts";
import { ouvrirGitHubDuGeste } from "../gestes/github-du-geste.ts";
import { ConfigInvalide } from "../runtime.ts";
import { direLaListe, listeDesCooksHumains } from "./liste.ts";
import { LABEL_COOK_HUMAIN } from "./marquer.ts";

const USAGE = "usage: BRIGADE_GITHUB_REPO=<owner/repo> npm --prefix runtime run human-cooks";

export async function principal({ args, env, dire, redire }: Appel): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  if (args.length > 0) echouer(2, `“${args.join(" ")}” is not a human-cooks command\n${USAGE}`);
  let rail: ReturnType<typeof configRail>;
  try {
    rail = configRail(env);
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message}\n${USAGE}`);
    throw erreur;
  }
  const github = ouvrirGitHubDuGeste({ depot: rail.depot, bin: rail.gh, env });
  try {
    let issues: Awaited<ReturnType<typeof github.ouvertesDuLabel>>;
    try {
      issues = await github.ouvertesDuLabel(LABEL_COOK_HUMAIN);
    } catch (erreur) {
      echouer(1, `the tickets waiting on a human cook are not read on GitHub — ${(erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]}`);
    }
    dire(direLaListe(listeDesCooksHumains(issues), rail.depot));
  } finally {
    github.fermer();
  }
}
