// La commande `trust` (#4421) : la porte de confiance, au chef.
//   npm --prefix runtime run trust -- author <login>
//   npm --prefix runtime run trust -- accept issue|comment <id>
//   npm --prefix runtime run trust -- check issue|comment <id>
// `author` dit si un auteur est de confiance : le chef — celui que la cuisine a
// résolu dans le répertoire d'état (`chef/chef.ts`) —, un agent de la cuisine,
// ou un compte qui a le droit d'écrire sur `BRIGADE_GITHUB_REPO`, lu sous le
// `gh` du poste (`BRIGADE_GH_BIN`, sinon `gh`). `accept` garde l'accord du chef
// sur une issue ou un commentaire dans le répertoire d'état (`BRIGADE_STATE_DIR`),
// `check` le relit.
import { Sortie, type Appel } from "../appel.ts";
import { lireLeChef } from "../chef/chef.ts";
import { ouvrirGitHubDuGeste } from "../gestes/github-du-geste.ts";
import { fichierDesAcceptes, ouvrirAcceptes, type Element } from "./acceptes.ts";
import { creerConfiance, type LirePermission } from "./trust.ts";

const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> BRIGADE_GITHUB_REPO=<owner>/<repo> npm --prefix runtime run trust -- author <login>",
  "       BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run trust -- accept|check issue|comment <id>",
  "  author: whether the author is trusted — the chef, a kitchen agent, or a collaborator with write access",
  "  accept: remember that the chef accepted this issue or comment; check: whether it is accepted",
].join("\n");

// Les appels GitHub du geste : le droit d'un auteur, lu une fois.
const PLAFOND = 1;

export type OuvrirGitHub = (depot: string, env: Appel["env"]) => { permission: LirePermission; fermer(): void };

const githubDuGeste: OuvrirGitHub = (depot, env) => {
  const github = ouvrirGitHubDuGeste({ depot, bin: env.BRIGADE_GH_BIN || "gh", env, plafond: PLAFOND });
  return { permission: (login) => github.permissionSurLeDepot(login), fermer: () => github.fermer() };
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export async function principal({ args, env, dire, redire }: Appel, ouvrir: OuvrirGitHub = githubDuGeste): Promise<void> {
  function echouer(code: number, texte: string): never {
    redire(`brigade : ${texte}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [geste, ...suite] = args;

  if (geste === "author") {
    const [auteur, ...reste] = suite;
    if (auteur === undefined || auteur.trim() === "" || reste.length > 0) echouer(2, USAGE);
    const depot = env.BRIGADE_GITHUB_REPO;
    if (!depot) echouer(2, `BRIGADE_GITHUB_REPO is not set\n${USAGE}`);
    const lu = lireLeChef(repertoireEtat);
    const chef = "login" in lu ? lu.login : null;
    const github = ouvrir(depot, env);
    try {
      const sur = await creerConfiance({ chef, permission: github.permission }).isTrusted(auteur);
      dire(sur ? `${auteur} is trusted` : `${auteur} is not trusted: not the chef, not a kitchen agent, and no write access to ${depot}`);
    } catch (erreur) {
      echouer(1, `GitHub: the permission of ${auteur} on ${depot} is not read — ${message(erreur)}`);
    } finally {
      github.fermer();
    }
    return;
  }

  if (geste === "accept" || geste === "check") {
    const [kind, id, ...reste] = suite;
    if ((kind !== "issue" && kind !== "comment") || !/^[1-9]\d*$/.test(id ?? "") || reste.length > 0) echouer(2, USAGE);
    const element: Element = { kind, id: Number(id) };
    try {
      const acceptes = ouvrirAcceptes(fichierDesAcceptes(repertoireEtat));
      if (geste === "accept") acceptes.accept(element);
      dire(acceptes.isAccepted(element) ? `${kind} ${id} is accepted` : `${kind} ${id} is not accepted`);
    } catch (erreur) {
      echouer(1, message(erreur));
    }
    return;
  }

  echouer(2, USAGE);
}
