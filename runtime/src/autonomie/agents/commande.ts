// La commande `autonomy` (#4036), que lance `autonomie-cli.ts` : l'autonomie de chaque agent du projet, vue et réglée par le chef.
//
//   npm --prefix runtime run autonomy                                 le niveau de chaque agent
//   npm --prefix runtime run autonomy -- <agent> <niveau>            pose le niveau d'un agent : manager, supervisor, closer, pass ou cook
//   npm --prefix runtime run autonomy -- manager split-epic <niveau>  pose celui du découpage d'une épique
// Les niveaux sont `observe`, `propose` et `act` (niveaux.ts) ; les fiches des agents, avec leur
// niveau, sont dans `facts` (`equipe`). Toute la sortie est en anglais.
import { Sortie, type Appel } from "../../appel.ts";
import { estNiveau, estReglable, magasinDeNiveaux, NIVEAUX, NiveauxIllisibles, REGLABLES } from "./niveaux.ts";

const USAGE = `usage: BRIGADE_STATE_DIR=<state directory> BRIGADE_PROJECT=<project> npm --prefix runtime run autonomy -- [<agent> <level> | manager split-epic <level>] — agents: manager, supervisor, closer, pass, cook; levels: ${NIVEAUX.join(", ")}`;

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const projet = env.BRIGADE_PROJECT;
  if (!projet) echouer(2, `BRIGADE_PROJECT is not set\n${USAGE}`);
  const reglable = args.length === 3 && args[0] === "manager" && args[1] === "split-epic" ? "manager split-epic" : args.length === 2 ? args[0] : undefined;
  const niveau = args.at(-1);

  const magasin = magasinDeNiveaux(repertoireEtat);
  try {
    if (args.length > 0) {
      if (!estReglable(reglable) || !estNiveau(niveau)) echouer(2, USAGE);
      magasin.poser(projet, reglable, niveau);
      dire(`brigade : ${reglable} is now on ${niveau}`);
      return;
    }
    const niveaux = magasin.lire(projet);
    for (const un of REGLABLES) dire(`${un.padEnd(20)}${niveaux[un]}`);
  } catch (erreur) {
    if (erreur instanceof NiveauxIllisibles) echouer(1, erreur.message);
    throw erreur;
  }
}
