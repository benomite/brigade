// La commande de la fermeture, et ses gestes :
//   npm --prefix runtime run closing              l'observation : elle lit, et ne touche à rien
//   npm --prefix runtime run closing -- write     la passe qui écrit : le geste du chef, et le seul qui la lance
//   npm --prefix runtime run closing -- cancel    renonce à la demande qui attend, avant qu'elle parte
// Les anciens mots (`fermeture`, `ecrire`, `annuler`) répondent encore, en
// disant le nouveau (`commandes.ts`).
// `write` ne lance rien lui-même : il écrit la demande au journal — le runtime
// qui tourne la voit dans la seconde, relit la condition d'exécution, et fait
// partir la passe sous ses garde-fous. Trop de cooks en vol, la demande
// attend : le runtime la fait partir seul, une fois, dès que la condition est
// remplie, et dit si elle attend sans issue. Ce qui ne passe pas seul — le
// closer non réglé, le « stop », le disjoncteur, une passe qui range déjà —
// refuse, et dit ce qui manque.
//
// Codes de sortie : 0, la demande est écrite, attend déjà, ou est retirée — ou
// il n'y avait rien à faire, et c'est dit ; 1, elle est refusée, rien n'est
// écrit ; 2, la commande est mal écrite.
import { existsSync } from "node:fs";
import { geste } from "../geste.ts";
import { enAnglais } from "../commandes.ts";
import { Sortie, type Appel } from "../appel.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { journalPasRejoue } from "../journal-pas-rejoue.ts";
import { sessionEnCours } from "../projections/sessions.ts";
import { demandeEnAttente, faitAttendre, mesurerCondition, passeEnCours, refus, reglagesEnVigueur, type Refus } from "./condition.ts";
import { ANNULER, direDemandeEn, direRefusEn, direReglagesEn } from "./dire.ts";
import { principal as observer } from "./observer.ts";

export const ECRIRE = "write";
export const RENONCER = "cancel";
const USAGE = `usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run closing -- [${ECRIRE} | ${RENONCER}]`;
const AUTEUR = "chef";
const SUITE = "          ";

function gerer({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  if (args.length !== 1) echouer(2, USAGE);
  // La commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);

  const journal = ouvrirJournal(repertoireEtat);
  try {
    const { base } = journal;
    const projetDuJournal = () => base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;

    // Vérifier et écrire tiennent dans une seule transaction : un cook qui
    // part entre les deux serait vu par le runtime, qui relit la condition.
    const demander = (): { refuse: Refus } | { dit: string } => {
      const projet = projetDuJournal();
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      // Personne ne lancerait la passe : la demander serait la laisser partir
      // plus tard, sans que le chef soit là.
      if (!sessionEnCours(base)) echouer(1, "no runtime is running on this project: the closing pass is not requested — nothing would start it");
      const reglages = reglagesEnVigueur(journal);
      // Une seule demande à la fois : redemandée, elle garde son heure.
      const attend = demandeEnAttente(base);
      if (attend !== null) {
        return { dit: `already requested, nothing is requested again — ${direDemandeEn(attend, refus(base, reglages, false))}` };
      }
      // Aucune n'attend : celle que `passeEnCours` voit range déjà.
      const refuse = refus(base, reglages, passeEnCours(journal) !== null);
      if ((refuse && !faitAttendre(refuse)) || !reglages) {
        const motif = refuse ?? { reason: "unconfigured", observed: null, limit: null, detail: null };
        journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.refused", payload: motif });
        return { refuse: motif };
      }
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.requested", payload: {} });
      const plafonds = `${SUITE}${direReglagesEn(reglages)}`;
      const neMergeRien = `${SUITE}it merges nothing: what it removes arrives through a PR, with what it left for lack of certainty`;
      if (refuse) {
        return {
          dit: [
            `closing pass requested — it waits: ${direRefusEn(refuse)}`,
            plafonds,
            `${SUITE}the runtime starts it on its own, once, as soon as nothing holds it back — nothing to watch, nothing to restart; it reads in the \`awaiting\` block of \`${geste(`status`)}\`, where it is called out as having no way out if it still waits in two hours`,
            `${SUITE}to withdraw it before it leaves: \`${ANNULER}\``,
            neMergeRien,
          ].join("\n"),
        };
      }
      const { enVol, seuil, rail } = mesurerCondition(base, reglages.cooksBelow);
      return {
        dit: [
          `closing pass requested — start condition met: ${enVol} cook${enVol > 1 ? "s" : ""} in flight for a threshold of ${seuil}${rail === 0 ? ", rail empty" : ""}`,
          plafonds,
          `${SUITE}the runtime starts it within the second, and rereads the condition at that moment; follow it with \`${geste(`log`)}\`, “stop” halts it (\`${geste(`guardrails stop`)}\`)`,
          neMergeRien,
        ].join("\n"),
      };
    };

    const annuler = (): { refuse: string } | { dit: string } => {
      const projet = projetDuJournal() ?? "?";
      const attend = demandeEnAttente(base);
      if (attend === null) {
        const partie = passeEnCours(journal);
        if (partie !== null) return { refuse: `closing run ${partie} has left: it cannot be recalled — “stop” halts it (\`${geste(`guardrails stop`)}\`), and nothing is delivered` };
        return { dit: "no closing pass is requested: nothing to cancel" };
      }
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.cancelled", payload: {} });
      return { dit: `closing pass request of ${attend.depuis} withdrawn: nothing has left, and nothing will leave without another request` };
    };

    const issue = base.transaction(() => (args[0] === RENONCER ? annuler() : demander()));
    if ("refuse" in issue) {
      if (typeof issue.refuse === "string") echouer(1, issue.refuse);
      echouer(1, `closing pass refused, nothing is started — ${direRefusEn(issue.refuse)}`);
    }
    dire(`brigade : ${issue.dit}`);
  } catch (erreur) {
    if (journalPasRejoue(erreur)) echouer(1, "this log does not yet have the state of the rail and the guardrails: restart the runtime, which recomputes it");
    throw erreur;
  } finally {
    journal.fermer();
  }
}

export function principal(tape: Appel): void {
  const appel = { ...tape, args: enAnglais("closing", tape.args, tape.redire) };
  if (appel.args[0] === ECRIRE || appel.args[0] === RENONCER) gerer(appel);
  else observer(appel);
}
