// La base d'intégration vue et commandée par le chef, depuis son propre process :
//   npm --prefix runtime run base             ce que son dernier contrôle a dit
//   npm --prefix runtime run base -- replay   rouge, ses gates sont rejouées sans attendre un commit
// L'ancien mot `rejouer` répond encore, en disant le nouveau (`commandes.ts`).
// Une base rouge retient la cuisine : aucun ticket n'est pris, rien n'est jugé
// ni mergé. La pass ne rejoue ses gates que si elle bouge — ou à ce geste,
// pour un rouge qui ne tient pas au code (un test instable, un délai dépassé).
// La demande s'écrit dans le journal ; la pass du runtime qui tourne la lit à
// son réveil, sans redémarrage.
import { existsSync } from "node:fs";
import { geste } from "./geste.ts";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { direBaseRougeEn, direControleRetenuEn, direPanneEn, direRejeuEn } from "./dire-base.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { controleRetenu, etatDeLaBase } from "./projections/pass.ts";
import { sessionEnCours } from "./projections/sessions.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run base -- [replay]";
const AUTEUR = "chef";

export function principal({ args: tapes, env, dire, redire }: Appel): void {
  const args = enAnglais("base", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  function montrer(journal: Journal): void {
    const controle = etatDeLaBase(journal.base);
    const retenu = controleRetenu(journal.base);
    if (controle?.outcome === "red") {
      for (const ligne of direBaseRougeEn(controle, retenu)) dire(ligne);
      return;
    }
    if (controle === null) dire(retenu === null ? "base never checked: no merge has had to be verified on it yet" : "base never checked");
    else if (controle.outcome === "green") dire(`base green at the last check, on ${controle.at} (${controle.sha.slice(0, 7)})`);
    else dire(`base not checked: its gates could not be played on ${controle.at} (${controle.sha.slice(0, 7)})${direPanneEn(controle.reason)} — nothing is held`);
    // Des merges attendent leur contrôle, et il ne part pas.
    if (retenu !== null) dire(`  ${direControleRetenuEn(retenu, (instant) => instant, "since")}`);
  }

  // Écrit la demande du chef si elle change quelque chose, et dit ce qu'il en
  // est. Vérifier et écrire tiennent dans une seule transaction.
  function rejouer(journal: Journal): string {
    const { base } = journal;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      const controle = etatDeLaBase(base);
      if (controle?.outcome !== "red") return "nothing to replay: the base is not red";
      if (controle.recheck !== null) return `replay already asked on ${controle.recheck.at}: ${direRejeuEn(controle.recheck, (instant) => instant, controleRetenu(base), "since")}`;
      const absent = sessionEnCours(base) ? "" : " (no runtime is running: the command will apply at its next start)";
      journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "base.recheck-requested", payload: {} });
      return `replay asked: the pass replays the base's gates on its current head, without waiting for a commit — green, the hold lifts; red, it stays. If the machine saturates or the base cannot be fetched, it waits; if the attempt does not run, the red stays and the request is to be made again: \`${geste(`status`)}\` says which, and why${absent}`;
    });
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const montre = args.length === 0;
  if (!montre && (args.length !== 1 || args[0] !== "replay")) echouer(2, USAGE);
  // Une commande ouvre le journal en écriture : sans ce contrôle, elle en
  // créerait un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);

  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: montre });
  try {
    if (montre) montrer(journal);
    else dire(`brigade : ${rejouer(journal)}`);
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant ce contrôle.
    if (journalPasRejoue(erreur)) {
      echouer(1, "this log does not have the base state yet: restart the runtime, which recomputes it");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
