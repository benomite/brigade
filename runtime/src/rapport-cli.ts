// The daily report of the decisions brigade took and told about, read by hand:
//   npm --prefix runtime run report
// The entries of the last 24 hours, grouped by kind of decision, each with a one-line summary and its
// link — or a line saying the day was empty (`autonomie/rapport/rapport.ts`). Read-only. Codes: 0, the
// report is printed (an empty one too); 1, the log cannot be read; 2, the call does not read.
//   npm --prefix runtime run report -- --week <YYYY-MM-DD>
// The project's weekly kitchen summary of the week starting that day, as JSON
// (`resume-hebdomadaire/cuisine.ts`, #3261): what the app displays. Code 1 when
// it was not produced, or its file does not read.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { direLeRapport, rapportDuJour } from "./autonomie/rapport/rapport.ts";
import { ouvrirJournal } from "./journal.ts";
import { lireLeResume } from "./resume-hebdomadaire/cuisine.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run report [-- --week <YYYY-MM-DD>]";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function principal({ args, env, dire, redire }: Appel, maintenant: Date = new Date()): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const semaine = args[0] === "--week" && args.length === 2 && DATE.test(args[1] ?? "") ? (args[1] as string) : null;
  if (args.length > 0 && semaine === null) echouer(2, USAGE);

  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    const projet = env.BRIGADE_PROJECT || journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
    if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
    if (semaine === null) {
      for (const ligne of direLeRapport(projet, rapportDuJour(journal.base, maintenant))) dire(ligne);
      return;
    }
    let resume;
    try {
      resume = lireLeResume(repertoireEtat, projet, semaine);
    } catch (erreur) {
      echouer(1, `the weekly summary of ${semaine} does not read: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
    if (resume === null) echouer(1, `no weekly summary of ${projet} for the week starting ${semaine}`);
    dire(JSON.stringify(resume, null, 2));
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess((appel) => principal(appel));
