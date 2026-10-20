// Les profils de cook proposés, vus et tranchés par le chef, depuis son propre process :
//   npm --prefix runtime run profile                       les propositions qui attendent le chef
//   npm --prefix runtime run profile -- yes <proposition>  « oui » : la définition du profil est écrite dans le dépôt du projet
//   npm --prefix runtime run profile -- no <proposition>   « non » : la proposition quitte la file
// `<proposition>` est le numéro que `facts` donne à la carte (`profils[].proposition`, le `seq` du fait
// `profile.proposed`). Le geste est celui de `decider` (profils/decision.ts) ; c'est lui que lance la
// carte de la file, dans l'app (app/src/profil.ts). Codes : 0, la réponse est écrite — ou la proposition
// l'était déjà ; 1, rien n'est écrit, la raison sur la dernière ligne ; 2, l'appel ne se lit pas.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { cartesDeProfil } from "./profils/cartes.ts";
import { decider, NON, OUI, type Reponse } from "./profils/decision.ts";

const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run profile -- [<answer> <proposal>]",
  "  yes <proposal>   write the profile's definition in the project's repository (BRIGADE_REPO_DIR)",
  "  no <proposal>    the proposal leaves the queue",
].join("\n");

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [reponse, numero, ...reste] = args;
  if (reponse !== undefined && reponse !== OUI && reponse !== NON) echouer(2, `unknown answer: “${reponse}”\n${USAGE}`);
  if (reponse !== undefined && (numero === undefined || !/^[1-9][0-9]*$/.test(numero) || reste.length > 0)) echouer(2, `the proposal's number is needed\n${USAGE}`);
  const repoDir = env.BRIGADE_REPO_DIR;
  if (reponse !== undefined && !repoDir) echouer(2, `BRIGADE_REPO_DIR is not set: the profile's definition is written there\n${USAGE}`);

  let journal: Journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: reponse === undefined });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    if (reponse === undefined) {
      const cartes = cartesDeProfil(journal);
      if (cartes.length === 0) dire("no cook profile is proposed");
      for (const { proposition, nom, domaine } of cartes) dire(`${proposition}  ${nom}  for ${domaine}`);
      return;
    }
    const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
    const proposition = Number(numero);
    const decision = decider({ journal, projet, repoDir: repoDir ?? "" }, proposition, reponse as Reponse);
    if (decision.issue === "inconnue") echouer(1, `no cook profile is proposed under ${proposition}`);
    if (decision.issue === "existe") echouer(1, `the project's repository already defines this profile (${decision.fichier}): nothing is written, the proposal still waits`);
    const { fait } = decision;
    const dit = fait.type === "profile.accepted" ? `“yes” to ${fait.payload.name}: its definition is written to ${fait.payload.file}` : `“no” to ${fait.payload.name}: the proposal leaves the queue`;
    dire(decision.issue === "deja" ? `already answered — ${dit}` : dit);
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
