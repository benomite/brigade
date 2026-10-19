// The closing command, and its gestures:
//   npm --prefix runtime run closing              the observation: it reads, and touches nothing
//   npm --prefix runtime run closing -- write     the writing pass: the chef's gesture, and the only one that launches it
//   npm --prefix runtime run closing -- cancel    withdraws the waiting request, before it leaves
//   npm --prefix runtime run closing -- --json    what the app reads: the observation, the last request, the drift — it reads, and launches nothing (`fermeture-lecture/`)
// and the same gestures for a program, the app (`fermeture-action/action.ts`):
// `preview`, `write --json --confirm`, `cancel --json`.
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
import { enAnglais } from "../commandes.ts";
import { Sortie, type Appel } from "../appel.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { journalPasRejoue } from "../journal-pas-rejoue.ts";
import { agir, estPourLApp } from "../fermeture-action/action.ts";
import { annuler, demander } from "../fermeture-action/demande.ts";
import { direDecision, direRetrait } from "../fermeture-action/dire.ts";
import { principal as observer } from "./observer.ts";
import { JSON_, principal as lire } from "../fermeture-lecture/commande.ts";

export const ECRIRE = "write";
export const RENONCER = "cancel";
const USAGE = `usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run closing -- [${ECRIRE} | ${RENONCER}]`;

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
    // The decision is `fermeture-action`'s, the app's too: here it is said.
    if (args[0] === RENONCER) {
      const retrait = annuler(log);
      if (retrait.issue === "partie") echouer(1, direRetrait(retrait));
      dire(`brigade : ${direRetrait(retrait)}`);
    } else {
      const decision = demander(log);
      if (decision.issue === "impossible" || decision.issue === "refusee") echouer(1, direDecision(decision));
      dire(`brigade : ${direDecision(decision)}`);
    }
  } catch (erreur) {
    if (journalPasRejoue(erreur)) echouer(1, "this log does not yet have the state of the rail and the guardrails: restart the runtime, which recomputes it");
    throw erreur;
  } finally {
    log.fermer();
  }
}

export function principal(tape: Appel): void {
  const appel = { ...tape, args: enAnglais("closing", tape.args, tape.redire) };
  // `--json` first: the reading, which every gesture of the app writes after its own word.
  if (appel.args[0] === JSON_) lire(appel);
  else if (estPourLApp(appel.args)) agir(appel);
  else if (appel.args[0] === ECRIRE || appel.args[0] === RENONCER) gerer(appel);
  else observer(appel);
}
