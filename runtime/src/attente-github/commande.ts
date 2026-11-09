// La commande `waiting` sur un ticket d'un projet GitHub seul (#3074), nommé
// par son dépôt et son numéro — attente-cli.ts lui passe la main dès que le
// ticket a cette forme :
//   npm --prefix runtime run waiting -- BOBL-tech/mirrorlab                       les cartes TODO et WAITING, lues de GitHub
//   npm --prefix runtime run waiting -- set BOBL-tech/mirrorlab#614 --what "…" --from "…" [--remind 2026-11-20]
//   npm --prefix runtime run waiting -- resume BOBL-tech/mirrorlab#614            WAITING → TODO
//   npm --prefix runtime run waiting -- arrived BOBL-tech/mirrorlab#614           c'est arrivé : en cuisine
// Rien ne passe par la box ni par son répertoire d'état : chaque geste s'écrit
// sur l'issue, sous le `gh` du poste (`BRIGADE_GH_BIN`, sinon `gh`).
import { Sortie, type Appel } from "../appel.ts";
import { ouvrirGitHub } from "../github.ts";
import { GesteRefuse } from "../rail.ts";
import { cestArriveGitHub, direAttenteGitHub, lireCartesGitHub, lireCible, lireDepot, mettreEnAttenteGitHub, reprendreGitHub, type GitHubDeLAttente } from "./attente-github.ts";

export const USAGE_GITHUB = [
  "usage: npm --prefix runtime run waiting -- <owner>/<repo> | <gesture> <owner>/<repo>#<issue> …",
  "  set <owner>/<repo>#<issue> --what <what it waits for> --from <who> [--remind <date, date and time, or duration>]",
  "  resume <owner>/<repo>#<issue>",
  "  arrived <owner>/<repo>#<issue>",
].join("\n");

const OPTIONS = ["--what", "--from", "--remind"];

// Les mots de la commande nomment-ils un ticket GitHub seul — ou son dépôt, pour la liste ?
export const pourGitHub = (args: readonly string[]): boolean => (args.length === 1 && lireDepot(args[0]) !== null) || lireCible(args[1]) !== null;

export type OuvrirGitHub = (depot: string) => GitHubDeLAttente & { fermer(): void };

export async function principalGitHub(
  args: readonly string[],
  { env, dire, redire }: Appel,
  maintenant: () => Date,
  ouvrir: OuvrirGitHub = (depot) => ouvrirGitHub({ depot, bin: env.BRIGADE_GH_BIN || "gh", usage: "geste" }),
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
      const { todo, waiting } = await lireCartesGitHub(github);
      dire(`TODO — ${depot}, read from GitHub`);
      if (todo.length === 0) dire("  nothing awaits the chef");
      for (const carte of todo) dire(`  #${carte.numero}  ${carte.ligne}  ${carte.titre}`);
      dire(`WAITING — ${depot}, read from GitHub`);
      if (waiting.length === 0) dire("  no ticket is waiting for a third party");
      for (const carte of waiting) dire(`  #${carte.numero}  ${carte.ligne}  ${carte.titre}`);
      return;
    }
    const nom = `${cible.depot}#${cible.numero}`;
    if (geste === "set") {
      const remind = lues.get("--remind");
      const attente = await mettreEnAttenteGitHub(github, cible, { quoi: quoi as string, qui: qui as string, ...(remind === undefined ? {} : { relance: remind }) }, maintenant());
      dire(`WAITING: ${nom}  ${direAttenteGitHub(attente)} — the \`waiting\` label and a comment are on the issue`);
    } else if (geste === "resume") {
      await reprendreGitHub(github, cible);
      dire(`${nom} resumed: \`waiting\` removed — the card it still carries is back in TODO`);
    } else {
      const retires = await cestArriveGitHub(github, cible);
      dire(`${nom} arrived: back to the kitchen — removed ${retires.map((label) => `\`${label}\``).join(", ")}; a station takes it in turn`);
    }
  } catch (erreur) {
    if (erreur instanceof Sortie) throw erreur;
    if (erreur instanceof GesteRefuse) echouer(1, erreur.message);
    echouer(1, `GitHub: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  } finally {
    github.fermer();
  }
}
