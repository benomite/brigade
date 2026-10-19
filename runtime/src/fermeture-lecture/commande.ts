// La fermeture, pour un programme : `closing --json`.
//   npm --prefix runtime run closing -- --json    l'objet de `lecture.ts`, sur une ligne
// Ce que l'app lit du closer d'un projet — l'observation, ses trouvailles, la
// dernière demande, ce qu'elle a retiré, la dérive — sans parser de texte.
// Elle lit et ne lance rien : le journal est ouvert en lecture seule, le dépôt
// n'est lu que par l'observation, qui ne rapatrie rien.
//
// Codes de sortie : 0, l'objet est écrit ; 1, il n'y a pas de journal à lire ;
// 2, la commande est mal écrite, ou ce qui désigne le dépôt est faux.
import { existsSync } from "node:fs";
import { Sortie, type Appel } from "../appel.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { journalPasRejoue } from "../journal-pas-rejoue.ts";
import { ConfigInvalide } from "../runtime.ts";
import { observer } from "../closing/observer.ts";
import { DepotIllisible, lireDepot } from "../closing/reading.ts";
import { lireFermeture } from "./lecture.ts";

export const JSON_ = "--json";
const USAGE = `usage: BRIGADE_STATE_DIR=<state directory> BRIGADE_REPO_DIR=<project clone> BRIGADE_BASE_BRANCH=<integration branch> npm --prefix runtime run closing -- ${JSON_}`;

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const exiger = (variable: string): string => env[variable] || echouer(2, `${variable} is not set\n${USAGE}`);
  if (args.length !== 1 || args[0] !== JSON_) echouer(2, USAGE);
  const repertoireEtat = exiger("BRIGADE_STATE_DIR");
  const clone = exiger("BRIGADE_REPO_DIR");
  const base = exiger("BRIGADE_BASE_BRANCH");
  // Le closer se lit au journal, que seul le runtime écrit : sans lui, rien ne
  // dit s'il est réglé — et l'ouvrir en lecture seule n'en crée aucun.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}: the runtime has never started on this state directory`);

  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  try {
    const lue = lireFermeture(journal, () => {
      try {
        return observer(lireDepot(clone, base, env));
      } catch (erreur) {
        if (erreur instanceof ConfigInvalide) echouer(2, erreur.message);
        if (erreur instanceof DepotIllisible) return { erreur: erreur.message };
        throw erreur;
      }
    });
    dire(JSON.stringify(lue));
  } catch (erreur) {
    if (journalPasRejoue(erreur)) echouer(1, "this log does not yet have the state of the rail and the measures: restart the runtime, which recomputes it");
    throw erreur;
  } finally {
    journal.fermer();
  }
}
