// La commande `send-word` (#4047) : un mot au cook d'un ticket en cuisine.
//   npm --prefix runtime run send-word -- <owner>/<repo>#<ticket> <word…>
// Elle répond sur la sortie standard, en une ligne JSON, le contrat que l'app
// suit : `{"ok":true}` (code 0), ou `{"ok":false,"reason":"…"}` (code 1),
// `reason` sur une ligne. Le mot est posté sur l'issue sous le `gh` du poste
// (`BRIGADE_GH_BIN`, sinon `gh`) — le compte du chef —, puis mis dans la file
// du ticket, dans le répertoire d'état du projet (`BRIGADE_STATE_DIR`), où le
// runtime le prend à la fin du tour du cook (`lanceur.ts`).
import { Sortie, type Appel } from "../appel.ts";
import { lireCible } from "../attente-github/attente-github.ts";
import { estParque, LABEL_IN_PASS, LABEL_TAKEN } from "../github-etat/etats.ts";
import { ouvrirGitHubDuGeste } from "../gestes/github-du-geste.ts";
import type { Issue } from "../github.ts";
import { fileSurDisque } from "./file.ts";
import { creerMotAuCook, type DependancesDuMot, type EtatDuTicket } from "./mot-au-cook.ts";

const USAGE = ["usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run send-word -- <owner>/<repo>#<ticket> <word…>", "  send one line of text to the cook of a taken ticket: it reaches the cook at the end of its current turn, and is posted on the issue"].join("\n");

// Les appels GitHub du geste : l'issue lue, le commentaire posté.
const PLAFOND = 2;

// L'état d'un ticket lu sur son issue (github-etat/etats.ts) ; null : elle n'existe pas.
function etatDeLIssue(issue: Pick<Issue, "state" | "labels"> | null): EtatDuTicket {
  if (issue === null) return undefined;
  if (issue.state !== "open") return "served";
  const labels = new Set(issue.labels);
  if (estParque(issue.labels)) return "parked";
  if (labels.has(LABEL_IN_PASS)) return "in pass";
  if (labels.has(LABEL_TAKEN)) return "taken";
  return "queued";
}

type OuvrirGitHub = (depot: string, env: Appel["env"]) => { issue(numero: number): Promise<Pick<Issue, "state" | "labels"> | null>; commenter(numero: number, corps: string): Promise<void>; fermer(): void };

const githubDuGeste: OuvrirGitHub = (depot, env) => ouvrirGitHubDuGeste({ depot, bin: env.BRIGADE_GH_BIN || "gh", env, plafond: PLAFOND });

export async function principal({ args, env, dire, redire }: Appel, ouvrir: OuvrirGitHub = githubDuGeste): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [nom, ...mots] = args;
  const cible = lireCible(nom);
  if (cible === null || mots.length === 0) echouer(2, nom === undefined ? USAGE : `the ticket is named <owner>/<repo>#<ticket>, then the word\n${USAGE}`);
  const github = ouvrir(cible.depot, { ...env, BRIGADE_STATE_DIR: repertoireEtat });
  try {
    const dependances: DependancesDuMot = {
      etat: async (ticket) => etatDeLIssue(await github.issue(ticket)),
      commenter: (ticket, corps) => github.commenter(ticket, corps),
      livrer: () => {},
      file: fileSurDisque(repertoireEtat, redire),
    };
    const reponse = await creerMotAuCook(dependances).envoyer({ ticket: cible.numero, text: mots.join(" ") });
    dire(JSON.stringify(reponse));
    if (!reponse.ok) throw new Sortie(1);
  } finally {
    github.fermer();
  }
}
