// The Agents tab's read side (#4220), for the app: `npm --prefix runtime run agents -- [<path>]` answers the path —
// /api/agents by default, or /api/agents/<id>/gestures — with its JSON on one line (agents-tab/api.ts). A path that
// is not served gives its reason on the error output, in 1. Played by agents-cli.ts.
// Each agent's settings are those `agent-settings` serves (#4222), read the same way.
import { LectureImpossible, Sortie, type Appel } from "../appel.ts";
import { repondre } from "./api.ts";
import { reglagesDuProjet, sourcesDuProjet } from "./sources.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run agents -- [/api/agents | /api/agents/<id>/gestures]";

export async function principal({ args, env, dire, redire }: Appel): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  if (!env.BRIGADE_STATE_DIR) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  if (args.length > 1) echouer(2, USAGE);
  let sources;
  try {
    sources = { ...sourcesDuProjet(env, new Date()), reglages: await reglagesDuProjet(env) };
  } catch (erreur) {
    if (erreur instanceof LectureImpossible) echouer(erreur.code, erreur.message);
    throw erreur;
  }
  const { statut, corps } = repondre({ method: "GET", url: args[0] ?? "/api/agents" }, sources);
  if (statut === 200) return dire(JSON.stringify(corps));
  echouer(1, `${statut}: ${(corps as { reason: string }).reason}`);
}

