// @ts-check
// D'où viennent les agents de l'onglet Agents (ticket 4224, épique 4117) : l'API du runtime, et elle seule. GET /api/agents
// rend les agents ; GET /api/agents/:id/settings, les réglages d'un agent ; PUT /api/agents/:id/settings, avec { key, value },
// le réglage changé — ou 400 et sa raison ; GET /api/agents/:id/gestures, ses derniers gestes, le plus récent d'abord.
// La vue est une page `file://` : ces chemins partent sur le schéma `brigade-agents:` (BASE_DES_AGENTS), que le process
// principal sert en lançant les commandes `agents` et `agent-settings` là où la cuisine du projet tourne
// (agents-de-la-box.ts). Le projet est nommé dans `?project=` : c'est sa box qui répond. Une réponse qui n'est pas un
// succès rejette, avec la raison que le runtime donne, ou son statut.
// La vue appelle chaque méthode par l'objet `source`, à chaque usage : un test y pose un faux.

/** @typedef {"idle" | "working" | "broken"} Etat */
/** @typedef {{ label: string, value: string, meaning: string }} Chiffre */
/** @typedef {{ id: string, name: string, role: string, state: Etat, workingOn: number | null, nextRun: string, figures: Chiffre[] }} Agent */
/** @typedef {{ key: string, label: string, kind: string, value: unknown, source: string, editable: boolean, livesIn: string | null, changedAt: string | null, changedBy: string | null }} Champ */
/** @typedef {{ at: string, summary: string, reason: string, issue: number | null }} Geste */

export const SCHEMA_DES_AGENTS = "brigade-agents";
export const BASE_DES_AGENTS = `${SCHEMA_DES_AGENTS}://box`;
const RACINE = "/api/agents";

/** @param {string} projet @param {string} chemin @param {{ method?: string, body?: string, headers?: Record<string, string> }} [options] @returns {Promise<unknown>} */
async function demander(projet, chemin, options) {
  const reponse = await fetch(`${BASE_DES_AGENTS}${chemin}?project=${encodeURIComponent(projet)}`, options);
  const lu = await reponse.json().catch(() => undefined);
  if (reponse.ok) return lu;
  const raison = /** @type {{ reason?: unknown } | undefined} */ (lu)?.reason;
  throw new Error(typeof raison === "string" ? raison : `the runtime answered ${reponse.status}`);
}

const deLAgent = (/** @type {string} */ id) => `${RACINE}/${encodeURIComponent(id)}`;

export const source = {
  /** @param {string} projet */
  lire: (projet) => demander(projet, RACINE),
  /** @param {string} projet @param {string} id */
  reglages: (projet, id) => demander(projet, `${deLAgent(id)}/settings`),
  /** @param {string} projet @param {string} id @param {string} key @param {unknown} value */
  changer: (projet, id, key, value) => demander(projet, `${deLAgent(id)}/settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }) }),
  /** @param {string} projet @param {string} id */
  gestes: (projet, id) => demander(projet, `${deLAgent(id)}/gestures`),
};
