// La commande `parked` (#4129, d'abord `waiting`, #3074) : parquer un ticket, l'en sortir, et lire les tickets parqués
// d'un projet — sur tout projet GitHub, sans box : le ticket se nomme par son dépôt et son numéro
// (`BOBL-tech/mirrorlab#614`), et chaque geste s'écrit sur l'issue, sous le `gh` du poste (`BRIGADE_GH_BIN`, sinon `gh`).
//   npm --prefix runtime run parked -- BOBL-tech/mirrorlab                          les tickets parqués : TODO, puis les autres
//   npm --prefix runtime run parked -- set BOBL-tech/mirrorlab#614 --what "…" --from "…" [--until 2026-11-20 | --fact "…"]
//   npm --prefix runtime run parked -- resume BOBL-tech/mirrorlab#614               la personne a répondu : il reprend où il était
//   npm --prefix runtime run parked -- arrived BOBL-tech/mirrorlab#614              le fait est arrivé : il reprend où il était
import { Sortie, type Appel } from "../appel.ts";
import { ouvrirGitHubDuGeste } from "../gestes/github-du-geste.ts";
import { GesteRefuse } from "../rail.ts";
import { cestArriveGitHub, direAttenteGitHub, lireCartesGitHub, lireCible, lireDepot, mettreEnAttenteGitHub, reprendreGitHub, type GitHubDeLAttente } from "./attente-github.ts";

export const USAGE_GITHUB = [
  "usage: npm --prefix runtime run parked -- <owner>/<repo> | <gesture> <owner>/<repo>#<issue> …",
  "  set <owner>/<repo>#<issue> --what <for what> --from <who: the chef, the client…> [--until <date, date and time, or duration> | --fact <the fact it waits for>]",
  "  resume <owner>/<repo>#<issue>",
  "  arrived <owner>/<repo>#<issue>",
].join("\n");

const OPTIONS = ["--what", "--from", "--until", "--fact"];

// Les mots de la commande nomment-ils un ticket GitHub — ou son dépôt, pour la liste ?
export const pourGitHub = (args: readonly string[]): boolean => (args.length === 1 && lireDepot(args[0]) !== null) || lireCible(args[1]) !== null;

export type OuvrirGitHub = (depot: string) => GitHubDeLAttente & { fermer(): void };

export async function principalGitHub(
  args: readonly string[],
  { env, dire, redire }: Appel,
  maintenant: () => Date,
  ouvrir: OuvrirGitHub = (depot) => ouvrirGitHubDuGeste({ depot, bin: env.BRIGADE_GH_BIN || "gh", env }),
): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const [geste, mot, ...suite] = args;
  const depotSeul = args.length === 1 ? lireDepot(geste) : null;
  const cible = lireCible(mot);
  if (depotSeul === null && cible === null) echouer(2, USAGE_GITHUB);
  if (cible !== null && !["set", "resume", "arrived"].includes(geste ?? "")) echouer(2, `unknown gesture: “${geste}”\n${USAGE_GITHUB}`);
  const lues = new Map<string, string>();
  for (let i = 0; i < suite.length; i++) {
    const option = suite[i] ?? "";
    if (!OPTIONS.includes(option) || lues.has(option) || i + 1 >= suite.length) echouer(2, USAGE_GITHUB);
    lues.set(option, suite[++i] ?? "");
  }
  if (geste !== "set" && lues.size > 0) echouer(2, USAGE_GITHUB);
  const quoi = lues.get("--what");
  const qui = lues.get("--from");
  if (geste === "set" && (quoi === undefined || qui === undefined)) echouer(2, `set: --what and --from are to be said\n${USAGE_GITHUB}`);

  const depot = depotSeul ?? (cible?.depot as string);
  const github = ouvrir(depot);
  try {
    if (cible === null) {
      const { todo, parked } = await lireCartesGitHub(github);
      dire(`TODO — parked for the chef, ${depot}, read from GitHub`);
      if (todo.length === 0) dire("  nothing waits for the chef");
      for (const carte of todo) dire(`  #${carte.numero}  ${carte.ligne}  ${carte.titre}`);
      dire(`PARKED — waiting for someone else, ${depot}, read from GitHub`);
      if (parked.length === 0) dire("  no other ticket is parked");
      for (const carte of parked) dire(`  #${carte.numero}  ${carte.ligne}  ${carte.titre}`);
      return;
    }
    const nom = `${cible.depot}#${cible.numero}`;
    if (geste === "set") {
      const until = lues.get("--until");
      const fact = lues.get("--fact");
      const attente = await mettreEnAttenteGitHub(github, cible, { quoi: quoi as string, qui: qui as string, ...(until === undefined ? {} : { relance: until }), ...(fact === undefined ? {} : { fait: fact }) }, maintenant());
      dire(`PARKED: ${nom}  ${direAttenteGitHub(attente)} — the \`parked\` label and its comment are on the issue`);
    } else {
      const retires = await (geste === "resume" ? reprendreGitHub : cestArriveGitHub)(github, cible);
      dire(`${nom} unparked: ${retires.map((label) => `\`${label}\``).join(", ")} removed — it resumes exactly where it was`);
    }
  } catch (erreur) {
    if (erreur instanceof Sortie) throw erreur;
    if (erreur instanceof GesteRefuse) echouer(1, erreur.message);
    echouer(1, `GitHub: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  } finally {
    github.fermer();
  }
}
