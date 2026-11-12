// La commande des livraisons design retenues pour le chef (#3184), que l'app
// appelle sur la carte « Validate its screen » :
//   npm --prefix runtime run design -- validate <owner>/<repo>#<PR>                          merge la PR, ferme la carte
//     (la tête a bougé depuis la carte : la validation est gardée, la pass merge la PR une fois sa tête verte)
//   npm --prefix runtime run design -- send-back <owner>/<repo>#<PR> --comment "<à changer>"  la renvoie à un cook, ferme la carte
// Rien ne passe par la box ni par son répertoire d'état : chaque geste s'écrit
// sur GitHub, sous le `gh` du poste (`BRIGADE_GH_BIN`, sinon `gh`).
import { Sortie, type Appel } from "../appel.ts";
import { lireCible } from "../attente-github/attente-github.ts";
import { brancheDuTicket } from "../brigade-github.ts";
import { ouvrirGitHub } from "../github.ts";
import { GesteRefuse } from "../rail.ts";
import { renvoyerLeDesign, valider, validationGardee, type GitHubDesGestes } from "./validation-design.ts";

const USAGE = [
  "usage: npm --prefix runtime run design -- <gesture> <owner>/<repo>#<PR> …",
  "  validate <owner>/<repo>#<PR>                          merge the delivery, close its card",
  "  send-back <owner>/<repo>#<PR> --comment <what to change>   send the delivery back to a cook, close its card",
].join("\n");

export type OuvrirGitHub = (depot: string) => GitHubDesGestes & { fermer(): void };

export async function principal({ args, env, dire, redire }: Appel, ouvrir: OuvrirGitHub = (depot) => ouvrirGitHub({ depot, bin: env.BRIGADE_GH_BIN || "gh", usage: "geste" })): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const [geste, mot, ...suite] = args;
  const cible = lireCible(mot);
  if (geste !== "validate" && geste !== "send-back") echouer(2, geste === undefined ? USAGE : `unknown gesture: “${geste}”\n${USAGE}`);
  if (cible === null) echouer(2, `the pull request is named <owner>/<repo>#<PR>\n${USAGE}`);
  let commentaire: string | null = null;
  if (geste === "send-back") {
    if (suite.length !== 2 || suite[0] !== "--comment") echouer(2, `send-back: --comment <what to change> is to be said\n${USAGE}`);
    commentaire = suite[1] ?? "";
  } else if (suite.length > 0) echouer(2, USAGE);

  const github = ouvrir(cible.depot);
  const nom = `${cible.depot}#${cible.numero}`;
  try {
    if (commentaire === null) {
      const { carte, ticket, enAttente } = await valider(github, cible.numero, brancheDuTicket);
      dire(enAttente ? validationGardee(nom, carte) : `${nom} validated: merged, card #${carte} closed — ticket #${ticket} is served`);
    } else {
      const { carte, ticket } = await renvoyerLeDesign(github, cible.numero, commentaire, brancheDuTicket);
      dire(`${nom} sent back: #${ticket} goes back to a cook with your comment, card #${carte} closed — its next delivery comes back as a new card`);
    }
  } catch (erreur) {
    if (erreur instanceof Sortie) throw erreur;
    if (erreur instanceof GesteRefuse) echouer(1, erreur.message);
    echouer(1, `GitHub: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  } finally {
    github.fermer();
  }
}
