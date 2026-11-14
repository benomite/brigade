// La commande `recap` de la box (#3581) : le passage par lequel l'app lit le
// récapitulatif d'un projet et dit l'avoir montré (`recap.ts`).
//
//   recap <owner>/<repo>                   le récapitulatif depuis le marqueur, en JSON
//   recap <owner>/<repo> seen <until>      il a été montré jusqu'à `until` : le marqueur y avance
//
// La lecture répond par une ligne de JSON, le récapitulatif ; ce qui ne se lit
// pas — GitHub, le journal, le marqueur — se dit sur la sortie d'erreur, en 1,
// et rien n'est écrit. `seen` répond `{"ok":true,"seenUntil":<instant>}`, ou
// `{"ok":false,"message":<la ligne du refus>}` avec le code de sortie 1. Un
// usage qui ne se lit pas sort avec le code 2.
import { Sortie, type Appel } from "../appel.ts";
import { ouvrirGitHub } from "../github.ts";
import { ouvrirJournal, type Journal } from "../journal.ts";
import { AvanceRefusee, avancerLeMarqueur, MarqueurIllisible } from "./marqueur.ts";
import { calculerLeRecap, type GitHubDuRecap } from "./recap.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run recap -- <owner>/<repo> [seen <instant>]";
const DEPOT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

type OuvrirLeGitHubDuRecap = (depot: string, env: Appel["env"]) => GitHubDuRecap;
const parGh: OuvrirLeGitHubDuRecap = (depot, env) => ouvrirGitHub({ depot, bin: env.BRIGADE_GH_BIN || "gh", usage: "geste" });

const uneLigne = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";

// `maintenant` : l'horloge, hors des tests. `ouvrir` : le GitHub du dépôt — celui du `gh` de la station, hors des tests.
export async function principal({ args, env, dire, redire }: Appel, maintenant = () => new Date(), ouvrir: OuvrirLeGitHubDuRecap = parGh): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [depot, geste, jusqua, ...trop] = args;
  const lisible = depot !== undefined && DEPOT.test(depot) && trop.length === 0 && ((geste === undefined && jusqua === undefined) || (geste === "seen" && jusqua !== undefined));
  if (!lisible) echouer(2, `“${args.join(" ")}” is not a recap command\n${USAGE}`);

  if (geste === "seen") {
    try {
      return dire(JSON.stringify({ ok: true, seenUntil: avancerLeMarqueur(repertoireEtat, jusqua ?? "", maintenant()) }));
    } catch (erreur) {
      if (!(erreur instanceof AvanceRefusee || erreur instanceof MarqueurIllisible)) throw erreur;
      dire(JSON.stringify({ ok: false, message: `the recap is not marked seen — ${erreur.message}` }));
      throw new Sortie(1);
    }
  }

  let journal: Journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    echouer(1, `the recap is not read — the guardrail stops: ${uneLigne(erreur)}`);
  }
  try {
    dire(JSON.stringify(await calculerLeRecap({ repertoireEtat, depot, github: ouvrir(depot, env), base: journal.base, maintenant: maintenant() })));
  } catch (erreur) {
    if (erreur instanceof Sortie) throw erreur;
    echouer(1, `the recap is not read — ${uneLigne(erreur)}`);
  } finally {
    journal.fermer();
  }
}
