// Les faits que l'app dessine, en lecture seule, dans une forme destinée à un
// programme : `npm --prefix runtime run facts` rend un objet JSON, sur une
// ligne. C'est la lecture de `status`, autrement dite — et un contrat :
// docs/runtime/etat-et-mesures.md, « Les faits, pour un programme ».
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { cartesDeCorrection } from "./correctif/cartes.ts";
import { faits, lireEtat } from "./etat.ts";
import { pauseDeLaStation } from "./limite-github.ts";
import { ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run facts";

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  if (args.length > 0) echouer(2, USAGE);

  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const maintenant = new Date();
    const forme = faits(lireEtat(journal, maintenant), maintenant, env.BRIGADE_GITHUB_REPO, pauseDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()));
    // Les corrections proposées n'y sont que s'il y en a : la forme d'une
    // cuisine qui n'en a aucune ne change pas.
    const corrections = cartesDeCorrection(journal, env.BRIGADE_GITHUB_REPO);
    dire(JSON.stringify(corrections.length === 0 ? forme : { ...forme, corrections }));
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant ces projections, ni ne leur donne leur forme du jour.
    if (journalPasRejoue(erreur)) {
      echouer(1, "ce journal n'a pas encore tout l'état que `faits` lit : redémarrer le runtime, qui le recalcule");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
