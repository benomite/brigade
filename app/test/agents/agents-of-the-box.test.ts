// L'API des agents servie par le process principal (agents-of-the-box.ts, ticket 4224) : chaque chemin que lit l'onglet Agents
// est une commande `agents` ou `agent-settings`, lancée là où la cuisine du projet nommé tourne. La vue y passe par `fetch`
// sur `brigade-agents:` (agents/source.js) : le dernier bloc la joue de bout en bout, la vraie `source` contre ce relais.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Read, Rendered } from "../../src/box.ts";
import { answerAtAgents, SCHEMA_OF_AGENTS, SCHEMA_PREFERRED } from "../../src/agents-of-the-box.ts";
import { BASE_OF_AGENTS, source } from "../../src/vue/agents/source.js";

type Request = Parameters<typeof answerAtAgents>[0];
const READ: Read = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const AGENTS = [{ id: "closer", name: "closer", role: "Removes dead code.", state: "idle", workingOn: null, nextRun: "in 3 h", figures: [], settings: null }];
const rendered = (output: string, error: Partial<ExecFileException> | null = null, errors = ""): Rendered => ({ lance: "$ node geste.ts parade …", erreur: error as ExecFileException | null, sortie: output, erreurs: errors });
const url = (path: string, project = "parade") => `${BASE_OF_AGENTS}${path}?project=${encodeURIComponent(project)}`;

// Le relais joué contre une station qui rend `reponse` : ce qu'il répond, et chaque commande lancée, avec son projet.
type Body = { corps?: unknown };
// Le projet que l'app connaît, et où sa cuisine tourne : parade, sur cet ordinateur.
const HERE = (project: string) => ({ vise: project === "parade" ? {} : undefined, lu: project === "parade" ? READ : undefined });
async function relay({ corps: body, ...request }: Partial<Omit<Request, "corps">> & Body & { url: string }, answer: Rendered = rendered("{}"), kitchen: (project: string) => { vise: unknown; lu: Read | undefined } = HERE) {
  const launched: string[] = [];
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const renderedOne = await answerAtAgents({ methode: "GET", corps: text, ...request }, kitchen, async (readOne, command) => (launched.push(`${readOne.nom}: ${command}`), answer));
  return { ...renderedOne, lancees: launched };
}

describe("each path of the contract is a runtime command, launched where the project's kitchen runs", () => {
  test("GET /api/agents runs `agents` and answers its JSON", async () => {
    const { statut: status, corps: body, lancees: launched } = await relay({ url: url("/api/agents") }, rendered(`${JSON.stringify(AGENTS)}\n`));
    assert.deepEqual([status, body, launched], [200, AGENTS, ["parade: agents"]]);
  });

  test("GET /api/agents/:id/gestures runs `agents` on that path", async () => {
    const actions = [{ at: "2026-11-25T08:00:00Z", summary: "removed 3 lines", reason: "unused", issue: 12 }];
    const { statut: status, corps: body, lancees: launched } = await relay({ url: url("/api/agents/closer/gestures") }, rendered(JSON.stringify(actions)));
    assert.deepEqual([status, body, launched], [200, actions, ["parade: agents '/api/agents/closer/gestures'"]]);
  });

  test("GET /api/agents/:id/settings runs `agent-settings <id>`", async () => {
    const { statut: status, corps: body, lancees: launched } = await relay({ url: url("/api/agents/closer/settings") }, rendered('{"fields":[]}'));
    assert.deepEqual([status, body, launched], [200, { fields: [] }, ["parade: agent-settings closer"]]);
  });

  test("PUT /api/agents/:id/settings runs `agent-settings <id> set <key> <value> --by chef` and answers the updated field", async () => {
    const field = { key: "model", value: "sonnet", changedAt: "2026-11-25T09:00:00Z", changedBy: "chef" };
    const { statut: status, corps: body, lancees: launched } = await relay({ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "model", value: "sonnet" } }, rendered(JSON.stringify(field)));
    assert.deepEqual([status, body, launched], [200, field, ["parade: agent-settings closer set model sonnet --by chef"]]);
    const text = await relay({ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "note", value: "it's late" } });
    assert.deepEqual(text.lancees, ["parade: agent-settings closer set note 'it'\\''s late' --by chef"]);
    const real = await relay({ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "paused", value: true } });
    assert.deepEqual(real.lancees, ["parade: agent-settings closer set paused true --by chef"]);
  });

  test("the project named in the address is the one whose box answers", async () => {
    const other: Read = { ...READ, nom: "atelier" };
    const { lancees: launched } = await relay({ url: url("/api/agents", "atelier") }, rendered("[]"), (project) => ({ vise: {}, lu: project === "atelier" ? other : READ }));
    assert.deepEqual(launched, ["atelier: agents"]);
  });
});

test("the scheme is declared so that the page's fetch can ask it", () => {
  assert.deepEqual(SCHEMA_PREFERRED, { scheme: "brigade-agents", privileges: { supportFetchAPI: true } });
});

describe("a refusal keeps its reason, and nothing unreadable becomes an answer", () => {
  test("a refused change answers 400 with the runtime's reason", async () => {
    const { statut: status, corps: body } = await relay({ methode: "PUT", url: url("/api/agents/closer/settings"), corps: { key: "effort", value: "huge" } }, rendered('{"reason":"effort must be one of low, medium, high"}\n', { code: 1 }));
    assert.deepEqual([status, body], [400, { reason: "effort must be one of low, medium, high" }]);
  });

  test("`agents` that refuses a path keeps its status and reason", async () => {
    const { statut: status, corps: body } = await relay({ url: url("/api/agents/ghost/gestures") }, rendered("", { code: 1 }, "brigade: 404: no agent is called ghost\n"));
    assert.deepEqual([status, body], [404, { reason: "no agent is called ghost" }]);
  });

  test("an answer that is not JSON, or a failure with no reason, is 502 and says so", async () => {
    const unreadable = await relay({ url: url("/api/agents") }, rendered("not json"));
    assert.equal(unreadable.statut, 502);
    assert.match(String((unreadable.corps as { reason: string }).reason), /could not be read: not json/);
    const failure = await relay({ url: url("/api/agents") }, rendered("", { code: 3 }, "boom"));
    assert.equal(failure.statut, 502);
    assert.match(String((failure.corps as { reason: string }).reason), /`agents` failed on this computer's station: .*boom/s);
    const old = await relay({ url: url("/api/agents") }, rendered("", { code: 66 }, "brigade: agents is not a runtime command"));
    assert.deepEqual([old.statut, old.corps], [502, { reason: "this station's runtime does not serve the agents yet — update it" }]);
  });

  test("a project that does not cook here, or that the app does not know, launches nothing", async () => {
    const elsewhere = await relay({ url: url("/api/agents") }, undefined, () => ({ vise: {}, lu: undefined }));
    assert.deepEqual([elsewhere.statut, elsewhere.lancees], [503, []]);
    assert.match(String((elsewhere.corps as { reason: string }).reason), /parade does not cook on this computer/);
    const unknown = await relay({ url: url("/api/agents", "gone") });
    assert.deepEqual([unknown.statut, unknown.corps, unknown.lancees], [404, { reason: "“gone” is no longer in the projects file" }, []]);
  });

  test("a path, an agent id, a key or a value that cannot go to the box launches nothing", async () => {
    const theCase: Array<[{ methode?: string; url: string } & Body, number]> = [
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
    for (const [request, expected] of theCase) {
      const { statut: status, lancees: launched } = await relay(request);
      assert.deepEqual([status, launched], [expected, []], `${request.methode ?? "GET"} ${request.url}`);
    }
  });
});

describe("the view's source reaches the box through this relay", () => {
  const fetchOfOrigin = globalThis.fetch;
  afterEach(() => void (globalThis.fetch = fetchOfOrigin));

  // Le `fetch` de la page tel que main.ts le sert sur `brigade-agents:` : la demande au relais, sa réponse en Response.
  function plug(answer: (command: string) => Rendered): string[] {
    const launched: string[] = [];
    globalThis.fetch = (async (entry: string, options: { method?: string; body?: string } = {}) => {
      assert.ok(entry.startsWith(`${SCHEMA_OF_AGENTS}:`), entry);
      const { statut: status, corps: body } = await answerAtAgents({ methode: options.method ?? "GET", url: entry, corps: options.body ?? "" }, HERE, async (readOne, command) => (launched.push(`${readOne.nom}: ${command}`), answer(command)));
      return new Response(JSON.stringify(body), { status: status });
    }) as typeof fetch;
    return launched;
  }

  test("reading, changing and the gestures of the project shown", async () => {
    const launched = plug((command) => rendered(command === "agents" ? JSON.stringify(AGENTS) : command.includes(" set ") ? '{"key":"paused","value":true,"changedBy":"chef"}' : "[]"));
    assert.deepEqual(await source.lire("parade"), AGENTS);
    assert.deepEqual(await source.changer("parade", "closer", "paused", true), { key: "paused", value: true, changedBy: "chef" });
    assert.deepEqual(await source.gestes("parade", "closer"), []);
    assert.deepEqual(launched, ["parade: agents", "parade: agent-settings closer set paused true --by chef", "parade: agents '/api/agents/closer/gestures'"]);
  });

  test("a refused change rejects with the runtime's reason", async () => {
    plug(() => rendered('{"reason":"maxTurns must be a whole number"}', { code: 1 }));
    await assert.rejects(source.changer("parade", "closer", "maxTurns", "many"), { message: "maxTurns must be a whole number" });
  });
});
