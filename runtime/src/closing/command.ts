// The closing command, and its gestures:
//   npm --prefix runtime run closing              the observation: it reads, and touches nothing
//   npm --prefix runtime run closing -- write     the writing pass: the chef's gesture, and the only one that launches it
//   npm --prefix runtime run closing -- cancel    withdraws the waiting request, before it leaves
// The old words (`fermeture`, `ecrire`, `annuler`) still answer, saying the new
// one (`commandes.ts`).
// `write` launches nothing itself: it writes the request to the log — the
// running runtime sees it within the second, rereads the start condition, and
// starts the pass under its guardrails. With too many cooks in flight, the
// request waits: the runtime starts it on its own, once, as soon as the
// condition is met, and says if it waits with no way out. What does not pass
// on its own — the closer not set, the "stop", the breaker, a pass already
// tidying — is refused, and says what is missing.
//
// Exit codes: 0, the request is written, already waiting, or withdrawn — or
// there was nothing to do, and it says so; 1, it is refused, nothing is
// written; 2, the command is badly written.
import { existsSync } from "node:fs";
import { geste } from "../geste.ts";
import { enAnglais } from "../commandes.ts";
import { Sortie, type Appel } from "../appel.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { journalPasRejoue } from "../journal-pas-rejoue.ts";
import { sessionEnCours } from "../projections/sessions.ts";
import { demandeEnAttente, faitAttendre, mesurerCondition, passeEnCours, refus, reglagesEnVigueur, type Refus } from "./condition.ts";
import { ANNULER, direDemandeEn, direRefusEn, direReglagesEn } from "./say.ts";
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
  // The command opens the log for writing: without this check, it would
  // create one where there is none.
  if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `no log in ${repertoireEtat}`);

  const log = ouvrirJournal(repertoireEtat);
  try {
    const { base } = log;
    const projetDuJournal = () => base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;

    // Checking and writing fit in a single transaction: a cook that leaves
    // between the two would be seen by the runtime, which rereads the condition.
    const demander = (): { refuse: Refus } | { dit: string } => {
      const projet = projetDuJournal();
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      // Nobody would launch the pass: requesting it would be letting it leave
      // later, with the chef not there.
      if (!sessionEnCours(base)) echouer(1, "no runtime is running on this project: the closing pass is not requested — nothing would start it");
      const reglages = reglagesEnVigueur(log);
      // One request at a time: asked again, it keeps its time.
      const waiting = demandeEnAttente(base);
      if (waiting !== null) {
        return { dit: `already requested, nothing is requested again — ${direDemandeEn(waiting, refus(base, reglages, false))}` };
      }
      // None is waiting: the one `passeEnCours` sees is already tidying.
      const refuse = refus(base, reglages, passeEnCours(log) !== null);
      if ((refuse && !faitAttendre(refuse)) || !reglages) {
        const motif = refuse ?? { reason: "unconfigured", observed: null, limit: null, detail: null };
        log.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.refused", payload: motif });
        return { refuse: motif };
      }
      log.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.requested", payload: {} });
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
      const waiting = demandeEnAttente(base);
      if (waiting === null) {
        const partie = passeEnCours(log);
        if (partie !== null) return { refuse: `closing run ${partie} has left: it cannot be recalled — “stop” halts it (\`${geste(`guardrails stop`)}\`), and nothing is delivered` };
        return { dit: "no closing pass is requested: nothing to cancel" };
      }
      log.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "closing.cancelled", payload: {} });
      return { dit: `closing pass request of ${waiting.since} withdrawn: nothing has left, and nothing will leave without another request` };
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
    log.fermer();
  }
}

export function principal(tape: Appel): void {
  const appel = { ...tape, args: enAnglais("closing", tape.args, tape.redire) };
  if (appel.args[0] === ECRIRE || appel.args[0] === RENONCER) gerer(appel);
  else observer(appel);
}
