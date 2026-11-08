// La commande `contributor-stations` de la box (#2936) : le passage par lequel
// l'app, sous Settings, lit les stations contributrices du projet et change la
// liste de celles que le chef refuse (`refus.ts`).
//
//   contributor-stations                         les stations qui ont pris un ticket, en JSON
//   contributor-stations refuse <station>        refuse cette station
//   contributor-stations accept <station>        la réaccepte
//
// Les deux derniers prennent `--role <role>` (le rôle de qui demande, `chef` par
// défaut : la commande est celle du chef, par son app) ; tout autre rôle est
// refusé. Une écriture répond par une ligne de JSON : `{"ok":true}`, ou
// `{"ok":false,"message":<la ligne du refus>}` avec le code de sortie 1. Un usage
// qui ne se lit pas sort avec le code 2.
import { configRail } from "../alimenter.ts";
import { Sortie, type Appel } from "../appel.ts";
import { ouvrirGitHub, type GitHub } from "../github.ts";
import { ConfigInvalide } from "../runtime.ts";
import { fichierDesRefus, ouvrirLesRefus, ROLE_DU_CHEF } from "./refus.ts";
import { NOM_DE_STATION, stationsQuiOntPris } from "./reclamation.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<dir> BRIGADE_GITHUB_REPO=<owner/repo> npm --prefix runtime run contributor-stations -- [refuse <station> | accept <station>] [--role <role>]";

// Combien de jours en arrière on cherche les prises : au-delà, une station qui n'a rien pris depuis ne se liste plus.
export const JOURS_VUS = 30;

export type StationVue = { station: string; login: string | null; refused: boolean };

// Les stations contributrices qui ont pris un ticket depuis `depuis`, plus celles que le chef refuse, même sans prise vue.
export async function listerLesStations(github: Pick<GitHub, "issuesDepuis" | "commentaires">, refusees: readonly string[], depuis: string): Promise<StationVue[]> {
  const logins = new Map<string, string>();
  for (const { number } of await github.issuesDepuis(depuis)) {
    for (const { station, login } of stationsQuiOntPris(await github.commentaires(number))) if (!logins.has(station)) logins.set(station, login);
  }
  const vues: StationVue[] = [...logins].map(([station, login]) => ({ station, login, refused: refusees.includes(station) }));
  for (const station of refusees) if (!logins.has(station)) vues.push({ station, login: null, refused: true });
  return vues;
}

export async function principal({ args, env, dire, redire }: Appel): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  const iRole = args.indexOf("--role");
  const role = iRole === -1 ? ROLE_DU_CHEF : args[iRole + 1];
  const mots = iRole === -1 ? args : args.filter((_, i) => i !== iRole && i !== iRole + 1);
  const [quoi, station, ...reste] = mots;
  if (role === undefined || !(quoi === undefined ? mots.length === 0 : (quoi === "refuse" || quoi === "accept") && station !== undefined && reste.length === 0)) {
    echouer(2, `“${args.join(" ")}” is not a contributor-stations command\n${USAGE}`);
  }
  const repertoire = env.BRIGADE_STATE_DIR;
  if (!repertoire) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const refus = ouvrirLesRefus(fichierDesRefus(repertoire));

  if (quoi !== undefined) {
    if (station === undefined || !NOM_DE_STATION.test(station)) {
      dire(JSON.stringify({ ok: false, message: `${JSON.stringify(station)} is not a station name` }));
      throw new Sortie(1);
    }
    try {
      if (quoi === "refuse") refus.refuser({ roles: [role] }, station);
      else refus.reaccepter({ roles: [role] }, station);
    } catch (erreur) {
      dire(JSON.stringify({ ok: false, message: (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] }));
      throw new Sortie(1);
    }
    dire(JSON.stringify({ ok: true }));
    return;
  }

  let rail: ReturnType<typeof configRail>;
  try {
    rail = configRail(env);
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message}\n${USAGE}`);
    throw erreur;
  }
  // Un geste du chef, par l'app : la box ne retient aucun de ses appels (limite-github.ts).
  const github = ouvrirGitHub({ depot: rail.depot, bin: rail.gh, usage: "geste" });
  try {
    const depuis = new Date(Date.now() - JOURS_VUS * 86_400_000).toISOString();
    dire(JSON.stringify({ stations: await listerLesStations(github, refus.liste(), depuis) }));
  } catch (erreur) {
    echouer(1, `the contributor stations are not read — ${(erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]}`);
  } finally {
    github.fermer();
  }
}
