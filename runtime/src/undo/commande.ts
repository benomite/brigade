// La commande d'annulation d'un ticket servi (#3274), le geste « undo » de sa
// carte dans l'app :
//   npm --prefix runtime run undo -- <owner>/<repo>#<ticket>
// Rien ne passe par la box ni par son répertoire d'état : tout s'écrit sur
// GitHub, sous le `gh` du poste (`BRIGADE_GH_BIN`, sinon `gh`) — le compte qui
// annule est le sien.
import { Sortie, type Appel } from "../appel.ts";
import { lireCible } from "../attente-github/attente-github.ts";
import { brancheDuTicket } from "../brigade-github.ts";
import { ouvrirGitHub } from "../github.ts";
import { GesteRefuse } from "../rail.ts";
import { annuler, type GitHubDeLAnnulation } from "./undo.ts";

const USAGE = ["usage: npm --prefix runtime run undo -- <owner>/<repo>#<ticket>", "  undo the served ticket: a pull request reverts its merge and goes through the pass, and the ticket is reopened"].join("\n");

export type OuvrirGitHub = (depot: string) => GitHubDeLAnnulation & { fermer(): void };

export async function principal({ args, env, dire, redire }: Appel, ouvrir: OuvrirGitHub = (depot) => ouvrirGitHub({ depot, bin: env.BRIGADE_GH_BIN || "gh", usage: "geste" })): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const [mot, ...suite] = args;
  const cible = lireCible(mot);
  if (cible === null || suite.length > 0) echouer(2, mot === undefined ? USAGE : `the ticket is named <owner>/<repo>#<ticket>\n${USAGE}`);
  const { depot, numero: ticket } = cible;
  const github = ouvrir(depot);
  try {
    const annulation = await annuler(github, ticket, brancheDuTicket);
    if (annulation.issue === "deja") dire(`#${ticket} is already being undone: ticket #${annulation.undo}`);
    else if (annulation.issue === "conflit") dire(`#${ticket} cannot be undone in one click: later work builds on it — ticket #${annulation.undo} asks the kitchen to undo it by hand`);
    else dire(`#${ticket} undone: ${annulation.pr === null ? "its revert" : `PR #${annulation.pr}`} goes through the pass as ticket #${annulation.undo}, and #${ticket} is reopened`);
  } catch (erreur) {
    if (erreur instanceof Sortie) throw erreur;
    if (erreur instanceof GesteRefuse) echouer(1, erreur.message);
    echouer(1, `GitHub: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  } finally {
    github.fermer();
  }
}
