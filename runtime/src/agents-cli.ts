// The Agents tab's read side (#4220), for the app: `npm --prefix runtime run agents -- [<path>]` answers the path —
// /api/agents by default, or /api/agents/<id>/gestures — with its JSON on one line (agents-tab/api.ts). A path that
// is not served gives its reason on the error output, in 1.
import { enProcess, LectureImpossible, Sortie, type Appel } from "./appel.ts";
import { repondre } from "./agents-tab/api.ts";
import { sourcesDuProjet } from "./agents-tab/sources.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run agents -- [/api/agents | /api/agents/<id>/gestures]";

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  if (!env.BRIGADE_STATE_DIR) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  if (args.length > 1) echouer(2, USAGE);
  let sources;
  try {
    sources = sourcesDuProjet(env, new Date());
  } catch (erreur) {
    if (erreur instanceof LectureImpossible) echouer(erreur.code, erreur.message);
    throw erreur;
  }
  const { statut, corps } = repondre({ method: "GET", url: args[0] ?? "/api/agents" }, sources);
  if (statut !== 200) echouer(1, `${statut}: ${(corps as { reason: string }).reason}`);
  dire(JSON.stringify(corps));
}

if (import.meta.main) await enProcess(principal);
