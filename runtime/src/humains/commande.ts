// La commande `humans` de la box (#2929) : le passage par lequel l'app joint
// le service des humains du projet (`service.ts`) — `ssh <box> brigade
// <projet> humans …`, ou le geste de la station de cet ordinateur. Elle ne pose
// rien sur la box : une écriture est une PR sur le dépôt du projet.
//
//   humans                          les humains déclarés, en JSON
//   humans save <login> [<role>…]   ajoute cet humain, ou change ses rôles
//   humans remove <login>           retire cet humain
//
// Une écriture répond par une ligne de JSON : `{"ok":true,"pr":<adresse>}`, ou
// `{"ok":false,"message":<la ligne du refus>}` avec le code de sortie 1. Un
// usage qui ne se lit pas sort avec le code 2.
import { configRail } from "../alimenter.ts";
import { Sortie, type Appel } from "../appel.ts";
import { ouvrirGitHub } from "../github.ts";
import { avecLaBrancheDuDepot } from "../reglages-projet/en-vigueur.ts";
import { ConfigInvalide } from "../runtime.ts";
import { ouvrirHumains } from "./service.ts";

const USAGE = "usage: BRIGADE_GITHUB_REPO=<owner/repo> BRIGADE_BASE_BRANCH=<branch> npm --prefix runtime run humans -- [save <login> [<role>…] | remove <login>]";

export async function principal({ args, env, dire, redire }: Appel): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  const [quoi, login, ...roles] = args;
  if (!(quoi === undefined || (quoi === "save" && login !== undefined) || (quoi === "remove" && login !== undefined && roles.length === 0))) echouer(2, `“${args.join(" ")}” is not a humans command\n${USAGE}`);
  let rail: ReturnType<typeof configRail>;
  try {
    rail = configRail(env);
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message}\n${USAGE}`);
    throw erreur;
  }
  const base = avecLaBrancheDuDepot(env).BRIGADE_BASE_BRANCH;
  if (!base) echouer(2, `BRIGADE_BASE_BRANCH is not set\n${USAGE}`);

  // Un geste du chef, par l'app : la box ne retient aucun de ses appels (limite-github.ts).
  const github = ouvrirGitHub({ depot: rail.depot, bin: rail.gh, usage: "geste" });
  try {
    const humains = ouvrirHumains({ github, depot: rail.depot, base });
    if (quoi === undefined) {
      try {
        dire(JSON.stringify({ humans: await humains.list() }));
      } catch (erreur) {
        echouer(1, `the project's humans are not read — ${(erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]}`);
      }
      return;
    }
    const ecriture = quoi === "save" ? await humains.save({ login, roles }) : await humains.remove(login as string);
    dire(JSON.stringify(ecriture));
    if (!ecriture.ok) throw new Sortie(1);
  } finally {
    github.fermer();
  }
}
