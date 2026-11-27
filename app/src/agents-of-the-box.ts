// L'API des agents que lit l'onglet Agents (ticket 4224, épique 4117), servie par le process principal : la vue est une
// page `file://`, et ses `fetch` partent sur le schéma `brigade-agents:` (vue/agents/source.js), que main.ts confie ici.
// Chaque chemin du contrat est une commande du runtime, lancée là où la cuisine du projet nommé dans `?project=` tourne :
//   GET /api/agents                  → `agents`
//   GET /api/agents/:id/gestures     → `agents /api/agents/<id>/gestures`
//   GET /api/agents/:id/settings     → `agent-settings <id>`
//   PUT /api/agents/:id/settings     → `agent-settings <id> set <key> <value> --by chef`
// La réponse est le JSON que la commande écrit, tel quel. Un refus du runtime garde sa raison et son statut — 400 pour un
// réglage refusé —; une commande qui échoue sans raison lisible, ou une sortie qui ne se lit pas, rend 502 et le dit :
// jamais une liste vide à la place d'une lecture ratée.
import { cite, type Read, type Rendered } from "./box.ts";
import { detailOf, withoutTheCommand } from "./settings-of-project.ts";

import { SCHEMA_OF_AGENTS } from "./vue/agents/source.js";

export { SCHEMA_OF_AGENTS };
// Le schéma tel que main.ts le déclare avant que l'app soit prête : `fetch` doit pouvoir le demander.
export const SCHEMA_PREFERRED = { scheme: SCHEMA_OF_AGENTS, privileges: { supportFetchAPI: true } };
// L'auteur d'un changement fait depuis l'app : le chef, celui qui tient l'app.
const AUTHOR = "chef";

// `corps` : le texte de la demande, tel que la page l'a envoyé — vide pour une lecture.
type Request = { methode: string; url: string; corps: string };
type Answer = { statut: number; corps: unknown };
type Launch = (readOne: Read, command: string) => Promise<Rendered>;

// Un agent, une clé de réglage : des mots sans blanc ni apostrophe, rien d'autre ne part sur la box.
const ID = /^[a-z][a-z0-9-]*$/;
const KEY = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const ACTIONS = /^\/api\/agents\/([^/]+)\/gestures$/;
const SETTINGS = /^\/api\/agents\/([^/]+)\/settings$/;
// Le refus de `agents` : `brigade: <statut>: <raison>` sur sa sortie d'erreur.
const REFUSAL = /^brigade: ([1-5][0-9]{2}): (.+)$/;

const reason = (status: number, text: string): Answer => ({ statut: status, corps: { reason: text } });

function readTheBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
const lastLine = (text: string): unknown => readTheBody(text.trim().split("\n").at(-1) ?? "");

// La commande d'une demande, ou la réponse qui la refuse sans rien lancer.
function commandOf({ methode: method, url, corps: body }: Request, path: string): string | Answer {
  if (path === "/api/agents") return method === "GET" ? "agents" : reason(405, `${method} is not served on ${path}`);
  const [, actions] = ACTIONS.exec(path) ?? [];
  const [, settings] = SETTINGS.exec(path) ?? [];
  const id = decodeURIComponent(actions ?? settings ?? "");
  if (!ID.test(id)) return reason(404, `${url} is not an agent's path`);
  if (actions !== undefined) return method === "GET" ? `agents ${cite(`/api/agents/${id}/gestures`)}` : reason(405, `${method} is not served on ${path}`);
  if (method === "GET") return `agent-settings ${id}`;
  if (method !== "PUT") return reason(405, `${method} is not served on ${path}`);
  const { key, value } = (readTheBody(body) ?? {}) as { key?: unknown; value?: unknown };
  if (typeof key !== "string" || !KEY.test(key)) return reason(400, "the change names no setting");
  if (!["string", "number", "boolean"].includes(typeof value) || String(value).trim() === "") return reason(400, `${key} needs a value`);
  return `agent-settings ${id} set ${key} ${cite(String(value))} --by ${AUTHOR}`;
}

// Ce que rend une commande lancée : sa réponse, son refus avec sa raison, ou 502.
function answerOf(rendered: Rendered, command: string): Answer {
  const readOne = lastLine(rendered.sortie);
  if (rendered.erreur === null) return readOne === undefined ? reason(502, `the answer of \`${command.split(" ")[0]}\` could not be read: ${rendered.sortie.trim().slice(0, 200)}`) : { statut: 200, corps: readOne };
  if (withoutTheCommand(rendered)) return reason(502, "this station's runtime does not serve the agents yet — update it");
  const saidOne = (readOne as { reason?: unknown } | undefined)?.reason;
  if (typeof saidOne === "string") return reason(400, saidOne);
  const [, status, text] = REFUSAL.exec(rendered.erreurs.trim().split("\n").at(-1) ?? "") ?? [];
  if (text !== undefined) return reason(Number(status), text);
  return reason(502, `\`${command.split(" ")[0]}\` failed on this computer's station: ${detailOf(rendered).slice(0, 400)}`);
}

// La réponse à une demande de la vue. `cuisine(projet)` : le projet que l'app connaît sous ce nom (`vise`), et où sa
// cuisine tourne (`lu`) — `undefined` pour un projet qui ne cuit pas sur cet ordinateur (main.ts, `cuisineDuProjet`).
export async function answerAtAgents(request: Request, kitchen: (project: string) => { vise: unknown; lu: Read | undefined }, launch: Launch): Promise<Answer> {
  const address = URL.parse(request.url);
  if (address === null) return reason(404, `${request.url} is not an agent's path`);
  const project = address.searchParams.get("project") ?? "";
  const { vise: aims, lu: readOne } = kitchen(project);
  if (aims === undefined) return reason(404, `“${project}” is no longer in the projects file`);
  if (readOne === undefined) return reason(503, `${project} does not cook on this computer: its agents are read where its kitchen runs`);
  const command = commandOf(request, address.pathname);
  if (typeof command !== "string") return command;
  return answerOf(await launch(readOne, command), command);
}
