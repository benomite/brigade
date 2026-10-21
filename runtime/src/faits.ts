// Les faits que l'app dessine, en lecture seule, dans une forme destinée à un
// programme : `npm --prefix runtime run facts` rend un objet JSON, sur une
// ligne. C'est la lecture de `status`, autrement dite — et un contrat :
// docs/runtime/etat-et-mesures.md, « Les faits, pour un programme ».
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { cartesDeCorrection } from "./correctif/cartes.ts";
import { reculDesCorrections } from "./correctif/recul.ts";
import { faits, lireEtat } from "./etat.ts";
import { pauseDeLaStation } from "./limite-github.ts";
import { refusDuProjet } from "./mise-a-jour/en-service.ts";
import { ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { apprentissageDuProjet } from "./apprentissage/projet.ts";
import { cartesDeProfil } from "./profils/cartes.ts";
import { decisionsPosees } from "./decisions.ts";
import { configPlafond } from "./reagir.ts";

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
    // Le refus de la station de cette machine, lu dans ce qu'elle dit d'elle-même :
    // les stations d'ici du projet sont alors `refused`.
    const refus = refusDuProjet(env.BRIGADE_STATION_DIR, env.BRIGADE_PROJECT);
    const forme = faits(lireEtat(journal, maintenant), maintenant, env.BRIGADE_GITHUB_REPO, pauseDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()), refus);
    // Les corrections proposées, ce que les acceptées ont fait de leur
    // cause, et les profils proposés n'y sont que s'il y en a : la forme d'une
    // cuisine qui n'en a aucun ne change pas.
    const corrections = cartesDeCorrection(journal, env.BRIGADE_GITHUB_REPO);
    const reculs = reculDesCorrections(journal);
    const profils = cartesDeProfil(journal, env.BRIGADE_GITHUB_REPO);
    // Ce que les cooks ont appris : absent quand le projet n'a ni leçon ni profil, ou quand son
    // carnet ou une définition est illisible — un fichier du dépôt ne fait pas taire les faits.
    const projet = env.BRIGADE_PROJECT;
    let apprentissage;
    try {
      apprentissage = projet ? apprentissageDuProjet({ journal, projet, repoDir: env.BRIGADE_REPO_DIR, depot: env.BRIGADE_GITHUB_REPO, branche: env.BRIGADE_BASE_BRANCH }) : undefined;
    } catch {
      apprentissage = undefined;
    }
    const appris = apprentissage !== undefined && (apprentissage.lecons.length > 0 || apprentissage.profils.length > 0);
    // Le plafond de calibrage du manager, tel que le runtime le lit : posé par
    // le chef, ou son défaut.
    const plafond = configPlafond(decisionsPosees(journal.base));
    const plafondDeCalibrage = { modele: plafond.model, effort: plafond.effort, parLeChef: { modele: plafond.pose.model, effort: plafond.pose.effort } };
    dire(JSON.stringify({ ...forme, plafondDeCalibrage, ...(corrections.length === 0 ? {} : { corrections }), ...(reculs.length === 0 ? {} : { reculs }), ...(profils.length === 0 ? {} : { profils }), ...(appris ? { apprentissage } : {}) }));
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
