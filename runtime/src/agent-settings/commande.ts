// The `agent-settings` command of the box (#4222): the way the app reads and changes each agent's settings
// (index.ts), the GET and the PUT of `/api/agents/:id/settings` from its own process.
//
//   agent-settings <agent>                                   GET: {"fields":[…]}
//   agent-settings <agent> set <key> <value> --by <author>   PUT: the updated field
//
// The answer is the route's body, on one line of JSON. A refusal — a value refused, a setting not editable from the
// app, a settings file that cannot be read — is `{"reason":…}` with exit code 1, and nothing is written. A usage that
// cannot be read exits with code 2. A value is read as JSON when it is a number or `true`/`false`, else as text.
//
// The environment the values come from is the runtime's: the chef's decisions held in the log and the project's
// repository over the box's variables (decisions.ts, `environnementDecide`).
import { Sortie, type Appel } from "../appel.ts";
import { environnementDecide, lireLesDecisions } from "../decisions.ts";
import { reglagesPourMontrer } from "../reglages-projet/en-vigueur.ts";
import { AGENTS } from "./fields.ts";
import { createAgentSettings } from "./index.ts";

const USAGE = `usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run agent-settings -- <${AGENTS.join(" | ")}> [set <key> <value> --by <author>]`;

const valueOf = (text: string): unknown => (/^(-?[0-9]+(\.[0-9]+)?|true|false)$/.test(text) ? JSON.parse(text) : text);

export async function principal({ args, env, dire, redire }: Appel): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  const stateDir = env.BRIGADE_STATE_DIR;
  if (!stateDir) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const rank = args.indexOf("--by");
  const author = rank === -1 ? undefined : args[rank + 1];
  const rest = rank === -1 ? args : [...args.slice(0, rank), ...args.slice(rank + 2)];
  const [agent, verb, key, value, ...extra] = rest;
  const readable = agent !== undefined && extra.length === 0 && ((verb === undefined && author === undefined) || (verb === "set" && key !== undefined && value !== undefined && author !== undefined));
  if (!readable) echouer(2, `“${args.join(" ")}” is not an agent-settings command\n${USAGE}`);

  const settings = createAgentSettings({ stateDir, env: environnementDecide(env, lireLesDecisions(stateDir).posees, reglagesPourMontrer(env)) });
  const path = `/api/agents/${encodeURIComponent(agent)}/settings`;
  const response = verb === undefined ? await settings.handle({ method: "GET", path }) : await settings.handle({ method: "PUT", path, body: { key, value: valueOf(value ?? "") }, ...(author === undefined ? {} : { author }) });
  dire(JSON.stringify(response.body));
  if (response.status !== 200) throw new Sortie(1);
}
