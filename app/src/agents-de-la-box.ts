// L'API des agents que lit l'onglet Agents (ticket 4224, épique 4117), servie par le process principal : la vue est une
// page `file://`, et ses `fetch` partent sur le schéma `brigade-agents:` (vue/agents/source.js), que main.ts confie ici.
// Chaque chemin du contrat est une commande du runtime, lancée là où la cuisine du projet nommé dans `?project=` tourne :
//   GET /api/agents                  → `agents`                                     (runtime/src/agents-tab/commande.ts)
//   GET /api/agents/:id/gestures     → `agents /api/agents/<id>/gestures`
//   GET /api/agents/:id/settings     → `agent-settings <id>`                        (runtime/src/agent-settings/commande.ts)
//   PUT /api/agents/:id/settings     → `agent-settings <id> set <key> <value> --by chef`
// La réponse est le JSON que la commande écrit, tel quel. Un refus du runtime garde sa raison et son statut — 400 pour un
// réglage refusé —; une commande qui échoue sans raison lisible, ou une sortie qui ne se lit pas, rend 502 et le dit :
// jamais une liste vide à la place d'une lecture ratée.
import { cite, type Lu, type Rendu } from "./box.ts";
import { detailDe, sansLaCommande } from "./reglages-du-projet.ts";

import { SCHEMA_DES_AGENTS } from "./vue/agents/source.js";

export { SCHEMA_DES_AGENTS };
// Le schéma tel que main.ts le déclare avant que l'app soit prête : `fetch` doit pouvoir le demander.
export const SCHEMA_PRIVILEGIE = { scheme: SCHEMA_DES_AGENTS, privileges: { supportFetchAPI: true } };
// L'auteur d'un changement fait depuis l'app : le chef, celui qui tient l'app.
export const AUTEUR = "chef";

// `corps` : le texte de la demande, tel que la page l'a envoyé — vide pour une lecture.
export type Demande = { methode: string; url: string; corps: string };
export type Reponse = { statut: number; corps: unknown };
type Lancer = (lu: Lu, commande: string) => Promise<Rendu>;

// Un agent, une clé de réglage : des mots sans blanc ni apostrophe, rien d'autre ne part sur la box.
const ID = /^[a-z][a-z0-9-]*$/;
const CLE = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const GESTES = /^\/api\/agents\/([^/]+)\/gestures$/;
const REGLAGES = /^\/api\/agents\/([^/]+)\/settings$/;
// Le refus de `agents` : `brigade: <statut>: <raison>` sur sa sortie d'erreur.
const REFUS = /^brigade: ([1-5][0-9]{2}): (.+)$/;

const raison = (statut: number, texte: string): Reponse => ({ statut, corps: { reason: texte } });

function lireLeCorps(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return undefined;
  }
}
const derniereLigne = (texte: string): unknown => lireLeCorps(texte.trim().split("\n").at(-1) ?? "");

// La commande d'une demande, ou la réponse qui la refuse sans rien lancer.
function commandeDe({ methode, url, corps }: Demande, chemin: string): string | Reponse {
  if (chemin === "/api/agents") return methode === "GET" ? "agents" : raison(405, `${methode} is not served on ${chemin}`);
  const [, gestes] = GESTES.exec(chemin) ?? [];
  const [, reglages] = REGLAGES.exec(chemin) ?? [];
  const id = decodeURIComponent(gestes ?? reglages ?? "");
  if (!ID.test(id)) return raison(404, `${url} is not an agent's path`);
  if (gestes !== undefined) return methode === "GET" ? `agents ${cite(`/api/agents/${id}/gestures`)}` : raison(405, `${methode} is not served on ${chemin}`);
  if (methode === "GET") return `agent-settings ${id}`;
  if (methode !== "PUT") return raison(405, `${methode} is not served on ${chemin}`);
  const { key, value } = (lireLeCorps(corps) ?? {}) as { key?: unknown; value?: unknown };
  if (typeof key !== "string" || !CLE.test(key)) return raison(400, "the change names no setting");
  if (!["string", "number", "boolean"].includes(typeof value) || String(value).trim() === "") return raison(400, `${key} needs a value`);
  return `agent-settings ${id} set ${key} ${cite(String(value))} --by ${AUTEUR}`;
}

// Ce que rend une commande lancée : sa réponse, son refus avec sa raison, ou 502.
function reponseDe(rendu: Rendu, commande: string): Reponse {
  const lu = derniereLigne(rendu.sortie);
  if (rendu.erreur === null) return lu === undefined ? raison(502, `the answer of \`${commande.split(" ")[0]}\` could not be read: ${rendu.sortie.trim().slice(0, 200)}`) : { statut: 200, corps: lu };
  if (sansLaCommande(rendu)) return raison(502, "this station's runtime does not serve the agents yet — update it");
  const dite = (lu as { reason?: unknown } | undefined)?.reason;
  if (typeof dite === "string") return raison(400, dite);
  const [, statut, texte] = REFUS.exec(rendu.erreurs.trim().split("\n").at(-1) ?? "") ?? [];
  if (texte !== undefined) return raison(Number(statut), texte);
  return raison(502, `\`${commande.split(" ")[0]}\` failed on this computer's station: ${detailDe(rendu).slice(0, 400)}`);
}

// La réponse à une demande de la vue. `cuisine(projet)` : le projet que l'app connaît sous ce nom (`vise`), et où sa
// cuisine tourne (`lu`) — `undefined` pour un projet qui ne cuit pas sur cet ordinateur (main.ts, `cuisineDuProjet`).
export async function repondreAuxAgents(demande: Demande, cuisine: (projet: string) => { vise: unknown; lu: Lu | undefined }, lancer: Lancer): Promise<Reponse> {
  const adresse = URL.parse(demande.url);
  if (adresse === null) return raison(404, `${demande.url} is not an agent's path`);
  const projet = adresse.searchParams.get("project") ?? "";
  const { vise, lu } = cuisine(projet);
  if (vise === undefined) return raison(404, `“${projet}” is no longer in the projects file`);
  if (lu === undefined) return raison(503, `${projet} does not cook on this computer: its agents are read where its kitchen runs`);
  const commande = commandeDe(demande, adresse.pathname);
  if (typeof commande !== "string") return commande;
  return reponseDe(await lancer(lu, commande), commande);
}
