// L'API des agents servie par le process principal (agents-de-la-box.ts, ticket 4224) : chaque chemin que lit l'onglet Agents
// est une commande `agents` ou `agent-settings`, lancée là où la cuisine du projet nommé tourne. La vue y passe par `fetch`
// sur `brigade-agents:` (agents/source.js) : le dernier bloc la joue de bout en bout, la vraie `source` contre ce relais.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Lu, Rendu } from "../../src/box.ts";
import { repondreAuxAgents, SCHEMA_DES_AGENTS, SCHEMA_PRIVILEGIE, type Demande } from "../../src/agents-de-la-box.ts";
import { BASE_DES_AGENTS, source } from "../../src/vue/agents/source.js";

const LU: Lu = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const AGENTS = [{ id: "closer", name: "closer", role: "Removes dead code.", state: "idle", workingOn: null, nextRun: "in 3 h", figures: [], settings: null }];
const rendu = (sortie: string, erreur: Partial<ExecFileException> | null = null, erreurs = ""): Rendu => ({ lance: "$ node geste.ts parade …", erreur: erreur as ExecFileException | null, sortie, erreurs });
const url = (chemin: string, projet = "parade") => `${BASE_DES_AGENTS}${chemin}?project=${encodeURIComponent(projet)}`;

// Le relais joué contre une station qui rend `reponse` : ce qu'il répond, et chaque commande lancée, avec son projet.
type Corps = { corps?: unknown };
// Le projet que l'app connaît, et où sa cuisine tourne : parade, sur cet ordinateur.
const ICI = (projet: string) => ({ vise: projet === "parade" ? {} : undefined, lu: projet === "parade" ? LU : undefined });
async function relayer({ corps, ...demande }: Partial<Omit<Demande, "corps">> & Corps & { url: string }, reponse: Rendu = rendu("{}"), cuisine: (projet: string) => { vise: unknown; lu: Lu | undefined } = ICI) {
  const lancees: string[] = [];
  const texte = corps === undefined ? "" : typeof corps === "string" ? corps : JSON.stringify(corps);
  const rendue = await repondreAuxAgents({ methode: "GET", corps: texte, ...demande }, cuisine, async (lu, commande) => (lancees.push(`${lu.nom}: ${commande}`), reponse));
  return { ...rendue, lancees };
}

describe("each path of the contract is a runtime command, launched where the project's kitchen runs", () => {
  test("GET /api/agents runs `agents` and answers its JSON", async () => {
    const { statut, corps, lancees } = await relayer({ url: url("/api/agents") }, rendu(`${JSON.stringify(AGENTS)}\n`));
    assert.deepEqual([statut, corps, lancees], [200, AGENTS, ["parade: agents"]]);
  });

  test("GET /api/agents/:id/gestures runs `agents` on that path", async () => {
    const gestes = [{ at: "2026-11-25T08:00:00Z", summary: "removed 3 lines", reason: "unused", issue: 12 }];
    const { statut, corps, lancees } = await relayer({ url: url("/api/agents/closer/gestures") }, rendu(JSON.stringify(gestes)));
    assert.deepEqual([statut, corps, lancees], [200, gestes, ["parade: agents '/api/agents/closer/gestures'"]]);
  });

  test("GET /api/agents/:id/settings runs `agent-settings <id>`", async () => {
    const { statut, corps, lancees } = await relayer({ url: url("/api/agents/closer/settings") }, rendu('{"fields":[]}'));
    assert.deepEqual([statut, corps, lancees], [200, { fields: [] }, ["parade: agent-settings closer"]]);
  });

  test("PUT /api/agents/:id/settings runs `agent-settings <id> set <key> <value> --by chef` and answers the updated field", async () => {
    const champ = { key: "model", value: "sonnet", changedAt: "2026-11-25T09:00:00Z", changedBy: "chef" };
    const { statut, corps, lancees } = await relayer({ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "model", value: "sonnet" } }, rendu(JSON.stringify(champ)));
    assert.deepEqual([statut, corps, lancees], [200, champ, ["parade: agent-settings closer set model sonnet --by chef"]]);
    const texte = await relayer({ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "note", value: "it's late" } });
    assert.deepEqual(texte.lancees, ["parade: agent-settings closer set note 'it'\\''s late' --by chef"]);
    const vrai = await relayer({ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "paused", value: true } });
    assert.deepEqual(vrai.lancees, ["parade: agent-settings closer set paused true --by chef"]);
  });

  test("the project named in the address is the one whose box answers", async () => {
    const autre: Lu = { ...LU, nom: "atelier" };
    const { lancees } = await relayer({ url: url("/api/agents", "atelier") }, rendu("[]"), (projet) => ({ vise: {}, lu: projet === "atelier" ? autre : LU }));
    assert.deepEqual(lancees, ["atelier: agents"]);
  });
});

test("the scheme is declared so that the page's fetch can ask it", () => {
  assert.deepEqual(SCHEMA_PRIVILEGIE, { scheme: "brigade-agents", privileges: { supportFetchAPI: true } });
});

describe("a refusal keeps its reason, and nothing unreadable becomes an answer", () => {
  test("a refused change answers 400 with the runtime's reason", async () => {
    const { statut, corps } = await relayer({ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "effort", value: "huge" } }, rendu('{"reason":"effort must be one of low, medium, high"}\n', { code: 1 }));
    assert.deepEqual([statut, corps], [400, { reason: "effort must be one of low, medium, high" }]);
  });

  test("`agents` that refuses a path keeps its status and reason", async () => {
    const { statut, corps } = await relayer({ url: url("/api/agents/ghost/gestures") }, rendu("", { code: 1 }, "brigade: 404: no agent is called ghost\n"));
    assert.deepEqual([statut, corps], [404, { reason: "no agent is called ghost" }]);
  });

  test("an answer that is not JSON, or a failure with no reason, is 502 and says so", async () => {
    const illisible = await relayer({ url: url("/api/agents") }, rendu("not json"));
    assert.equal(illisible.statut, 502);
    assert.match(String((illisible.corps as { reason: string }).reason), /could not be read: not json/);
    const echec = await relayer({ url: url("/api/agents") }, rendu("", { code: 3 }, "boom"));
    assert.equal(echec.statut, 502);
    assert.match(String((echec.corps as { reason: string }).reason), /`agents` failed on this computer's station: .*boom/s);
    const ancien = await relayer({ url: url("/api/agents") }, rendu("", { code: 66 }, "brigade: agents is not a runtime command"));
    assert.deepEqual([ancien.statut, ancien.corps], [502, { reason: "this station's runtime does not serve the agents yet — update it" }]);
  });

  test("a project that does not cook here, or that the app does not know, launches nothing", async () => {
    const ailleurs = await relayer({ url: url("/api/agents") }, undefined, () => ({ vise: {}, lu: undefined }));
    assert.deepEqual([ailleurs.statut, ailleurs.lancees], [503, []]);
    assert.match(String((ailleurs.corps as { reason: string }).reason), /parade does not cook on this computer/);
    const inconnu = await relayer({ url: url("/api/agents", "gone") });
    assert.deepEqual([inconnu.statut, inconnu.corps, inconnu.lancees], [404, { reason: "“gone” is no longer in the projects file" }, []]);
  });

  test("a path, an agent id, a key or a value that cannot go to the box launches nothing", async () => {
    const cas: Array<[{ methode?: string; url: string } & Corps, number]> = [
      [{ methode: "PUT", url: url("/api/agents/closer/settings"), corps: "{not json" }, 400],
      [{ url: url("/api/other") }, 404],
      [{ url: url("/api/agents/Bad%20Id/settings") }, 404],
      [{ url: url("/api/agents/closer/nothing") }, 404],
      [{ methode: "POST", url: url("/api/agents") }, 405],
      [{ methode: "PUT", url: url("/api/agents/closer/gestures") }, 405],
      [{ methode: "DELETE", url: url("/api/agents/closer/settings") }, 405],
      [{ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "a b", value: "x" } }, 400],
      [{ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "model" } }, 400],
      [{ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "model", value: " " } }, 400],
      [{ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "model", value: { a: 1 } } }, 400],
      [{ methode: "PUT", url: url("/api/agents/closer/settings") }, 400],
    ];
    for (const [demande, attendu] of cas) {
      const { statut, lancees } = await relayer(demande);
      assert.deepEqual([statut, lancees], [attendu, []], `${demande.methode ?? "GET"} ${demande.url}`);
    }
  });
});

describe("the view's source reaches the box through this relay", () => {
  const fetchDOrigine = globalThis.fetch;
  afterEach(() => void (globalThis.fetch = fetchDOrigine));

  // Le `fetch` de la page tel que main.ts le sert sur `brigade-agents:` : la demande au relais, sa réponse en Response.
  function brancher(reponse: (commande: string) => Rendu): string[] {
    const lancees: string[] = [];
    globalThis.fetch = (async (entree: string, options: { method?: string; body?: string } = {}) => {
      assert.ok(entree.startsWith(`${SCHEMA_DES_AGENTS}:`), entree);
      const { statut, corps } = await repondreAuxAgents({ methode: options.method ?? "GET", url: entree, corps: options.body ?? "" }, ICI, async (lu, commande) => (lancees.push(`${lu.nom}: ${commande}`), reponse(commande)));
      return new Response(JSON.stringify(corps), { status: statut });
    }) as typeof fetch;
    return lancees;
  }

  test("reading, changing and the gestures of the project shown", async () => {
    const lancees = brancher((commande) => rendu(commande === "agents" ? JSON.stringify(AGENTS) : commande.includes(" set ") ? '{"key":"paused","value":true,"changedBy":"chef"}' : "[]"));
    assert.deepEqual(await source.lire("parade"), AGENTS);
    assert.deepEqual(await source.changer("parade", "closer", "paused", true), { key: "paused", value: true, changedBy: "chef" });
    assert.deepEqual(await source.gestes("parade", "closer"), []);
    assert.deepEqual(lancees, ["parade: agents", "parade: agent-settings closer set paused true --by chef", "parade: agents '/api/agents/closer/gestures'"]);
  });

  test("a refused change rejects with the runtime's reason", async () => {
    brancher(() => rendu('{"reason":"maxTurns must be a whole number"}', { code: 1 }));
    await assert.rejects(source.changer("parade", "closer", "maxTurns", "many"), { message: "maxTurns must be a whole number" });
  });
});
