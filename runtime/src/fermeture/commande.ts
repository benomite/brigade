// La commande de la fermeture, et ses deux gestes :
//   npm --prefix runtime run fermeture              l'observation : elle lit, et ne touche à rien
//   npm --prefix runtime run fermeture -- ecrire    la passe qui écrit : le geste du chef, et le seul qui la lance
// `ecrire` ne lance rien lui-même : il vérifie la condition d'exécution, dit
// ce qui manque et la valeur mesurée, ou écrit la demande au journal — le
// runtime qui tourne la voit dans la seconde, la relit, et fait partir la passe
// sous ses garde-fous.
import { existsSync } from "node:fs";
import { Sortie, type Appel } from "../appel.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { journalPasRejoue } from "../journal-pas-rejoue.ts";
import { sessionEnCours } from "../projections/sessions.ts";
import { mesurerCondition, passeEnCours, refus, reglagesEnVigueur, type Refus } from "./condition.ts";
import { direRefus, direReglages } from "./dire.ts";
import { principal as observer } from "./observer.ts";

export const ECRIRE = "ecrire";
const USAGE = `usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run fermeture -- ${ECRIRE}`;
const AUTEUR = "chef";

function demander({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  if (args.length !== 1) echouer(2, USAGE);
  // La commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

  const journal = ouvrirJournal(repertoireEtat);
  try {
    const { base } = journal;
    // Vérifier et écrire tiennent dans une seule transaction : un cook qui
    // part entre les deux serait vu par le runtime, qui relit la condition.
    const issue = base.transaction((): { refuse: Refus } | { demandee: string } => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
      // Personne ne lancerait la passe : la demander serait la laisser partir
      // plus tard, sans que le chef soit là.
      if (!sessionEnCours(base)) echouer(1, "aucun runtime ne tourne sur ce projet : la passe n'est pas demandée — rien ne la lancerait");
      const reglages = reglagesEnVigueur(journal);
      const refuse = refus(base, reglages, passeEnCours(journal) !== null);
      if (refuse || !reglages) {
        const motif = refuse ?? { reason: "unconfigured", observed: null, limit: null, detail: null };
        journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.refused", payload: motif });
        return { refuse: motif };
      }
      const { enVol, seuil, rail } = mesurerCondition(base, reglages.cooksBelow);
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.requested", payload: {} });
      return {
        demandee: [
          `passe de fermeture demandée — condition d'exécution remplie : ${enVol} cook${enVol > 1 ? "s" : ""} en vol pour un seuil de ${seuil}${rail === 0 ? ", rail vide" : ""}`,
          `          ${direReglages(reglages)}`,
          "          le runtime la lance dans la seconde, et relit la condition à cet instant ; elle se suit par `run journal`, « stop » l'arrête (`run garde-fous -- stop`)",
          "          elle ne merge rien : ce qu'elle retire arrive par une PR, avec ce qu'elle a laissé faute d'être sûre",
        ].join("\n"),
      };
    });
    if ("refuse" in issue) echouer(1, `passe de fermeture refusée, rien n'est lancé — ${direRefus(issue.refuse)}`);
    dire(`brigade : ${issue.demandee}`);
  } catch (erreur) {
    if (journalPasRejoue(erreur)) echouer(1, "ce journal n'a pas encore l'état du rail et des garde-fous : redémarrer le runtime, qui le recalcule");
    throw erreur;
  } finally {
    journal.fermer();
  }
}

export function principal(appel: Appel): void {
  if (appel.args[0] === ECRIRE) demander(appel);
  else observer(appel);
}
