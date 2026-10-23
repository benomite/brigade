// The daily report of the decisions brigade took and told about, read by hand:
//   npm --prefix runtime run report
// The entries of the last 24 hours, grouped by kind of decision, each with a one-line summary and its
// link — or a line saying the day was empty (`autonomie/rapport/rapport.ts`). Read-only. Codes: 0, the
// report is printed (an empty one too); 1, the log cannot be read; 2, the call does not read.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { direLeRapport, rapportDuJour } from "./autonomie/rapport/rapport.ts";
import { ouvrirJournal } from "./journal.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run report";

export function principal({ args, env, dire, redire }: Appel, maintenant: Date = new Date()): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  if (args.length > 0) echouer(2, USAGE);

  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const projet = env.BRIGADE_PROJECT || journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
    for (const ligne of direLeRapport(projet, rapportDuJour(journal.base, maintenant))) dire(ligne);
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
