// La commande des tickets sensibles retenus pour le chef (#3223), sur la carte
// « review before merge » :
//   npm --prefix runtime run sensitive -- merge <owner>/<repo>#<PR>                     merge la PR, ferme la carte
//   npm --prefix runtime run sensitive -- send-back <owner>/<repo>#<PR> --note "<note>"  renvoie le ticket à un cook, ferme la carte
// Rien ne passe par la box ni par son répertoire d'état : chaque geste s'écrit
// sur GitHub, sous le `gh` du poste (`BRIGADE_GH_BIN`, sinon `gh`).
import { Sortie, type Appel } from "../appel.ts";
import { lireCible } from "../attente-github/attente-github.ts";
import { brancheDuTicket } from "../brigade-github.ts";
import { ouvrirGitHub } from "../github.ts";
import { GesteRefuse } from "../rail.ts";
import type { GitHubDesGestes } from "../validation-design/validation-design.ts";
import { merger, renvoyer } from "./sensible.ts";

const USAGE = [
  "usage: npm --prefix runtime run sensitive -- <answer> <owner>/<repo>#<PR> …",
  "  merge <owner>/<repo>#<PR>                     merge the delivery of the sensitive ticket, close its card",
  "  send-back <owner>/<repo>#<PR> --note <note>   send the ticket back to a cook with the note, close its card",
].join("\n");

export type OuvrirGitHub = (depot: string) => GitHubDesGestes & { fermer(): void };

export async function principal({ args, env, dire, redire }: Appel, ouvrir: OuvrirGitHub = (depot) => ouvrirGitHub({ depot, bin: env.BRIGADE_GH_BIN || "gh", usage: "geste" })): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const [reponse, mot, ...suite] = args;
  const cible = lireCible(mot);
  if (reponse !== "merge" && reponse !== "send-back") echouer(2, reponse === undefined ? USAGE : `unknown answer: “${reponse}”\n${USAGE}`);
  if (cible === null) echouer(2, `the pull request is named <owner>/<repo>#<PR>\n${USAGE}`);
  let note: string | null = null;
  if (reponse === "send-back") {
    if (suite.length !== 2 || suite[0] !== "--note") echouer(2, `send-back: --note <note> is to be said\n${USAGE}`);
    note = suite[1] ?? "";
  } else if (suite.length > 0) echouer(2, USAGE);

  const github = ouvrir(cible.depot);
  const nom = `${cible.depot}#${cible.numero}`;
  try {
    if (note === null) {
      const { carte, ticket, enAttente } = await merger(github, cible.numero, brancheDuTicket);
      dire(enAttente ? `${nom}: your answer is kept, card #${carte} closed — the branch was updated since the card and is being checked again; the pass merges it once its head is green` : `${nom} merged, card #${carte} closed — ticket #${ticket} is served`);
    } else {
      const { carte, ticket } = await renvoyer(github, cible.numero, note, brancheDuTicket);
      dire(`${nom} sent back: #${ticket} goes back to a cook with your note, card #${carte} closed — its next delivery comes back as a new card`);
    }
  } catch (erreur) {
    if (erreur instanceof Sortie) throw erreur;
    if (erreur instanceof GesteRefuse) echouer(1, erreur.message);
    echouer(1, `GitHub: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  } finally {
    github.fermer();
  }
}
