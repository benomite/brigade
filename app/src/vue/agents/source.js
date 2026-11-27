// @ts-check
// D'où viennent les agents de l'onglet Agents (ticket 4224, épique 4117) : l'API du runtime, et elle seule. GET /api/agents
// rend les agents ; GET /api/agents/:id/settings, les réglages d'un agent ; PUT /api/agents/:id/settings, avec { key, value },
// le réglage changé — ou 400 et sa raison ; GET /api/agents/:id/gestures, ses derniers gestes, le plus récent d'abord.
// La vue est une page `file://` : ces chemins partent sur le schéma `brigade-agents:` (BASE_DES_AGENTS), que le process
// principal sert en lançant les commandes `agents` et `agent-settings` là où la cuisine du projet tourne
// (agents-of-the-box.ts). Le projet est nommé dans `?project=` : c'est sa box qui répond. Une réponse qui n'est pas un
// succès rejette, avec la raison que le runtime donne, ou son statut.
// La vue appelle chaque méthode par l'objet `source`, à chaque usage : un test y pose un faux.

/** @typedef {"idle" | "working" | "broken"} State */
/** @typedef {{ label: string, value: string, meaning: string }} Figure */
/** @typedef {{ id: string, name: string, role: string, state: State, workingOn: number | null, nextRun: string, figures: Figure[] }} Agent */
/** @typedef {{ key: string, label: string, kind: string, value: unknown, source: string, editable: boolean, livesIn: string | null, changedAt: string | null, changedBy: string | null }} Field */
/** @typedef {{ at: string, summary: string, reason: string, issue: number | null }} Action */

export const SCHEMA_OF_AGENTS = "brigade-agents";
export const BASE_OF_AGENTS = `${SCHEMA_OF_AGENTS}://box`;
const ROOT = "/api/agents";

/** @param {string} project @param {string} path @param {{ method?: string, body?: string, headers?: Record<string, string> }} [options] @returns {Promise<unknown>} */
async function ask(project, path, options) {
  const answer = await fetch(`${BASE_OF_AGENTS}${path}?project=${encodeURIComponent(project)}`, options);
  const readOne = await answer.json().catch(() => undefined);
  if (answer.ok) return readOne;
  const reason = /** @type {{ reason?: unknown } | undefined} */ (readOne)?.reason;
  throw new Error(typeof reason === "string" ? reason : `the runtime answered ${answer.status}`);
}

const ofTheAgent = (/** @type {string} */ id) => `${ROOT}/${encodeURIComponent(id)}`;

export const source = {
  /** @param {string} project */
  lire: (project) => ask(project, ROOT),
  /** @param {string} project @param {string} id */
  reglages: (project, id) => ask(project, `${ofTheAgent(id)}/settings`),
  /** @param {string} project @param {string} id @param {string} key @param {unknown} value */
  changer: (project, id, key, value) => ask(project, `${ofTheAgent(id)}/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }) }),
  /** @param {string} project @param {string} id */
  gestes: (project, id) => ask(project, `${ofTheAgent(id)}/gestures`),
};
