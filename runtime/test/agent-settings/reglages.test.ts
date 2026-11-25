// #4222 : les routes des réglages d'un agent — ce qu'elles refusent, d'où vient chaque valeur, qui l'a changée et
// quand, et ce qu'elles font d'un fichier illisible.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings, type Field } from "../../src/agent-settings/index.ts";

const fresh = (env: Record<string, string> = {}) => {
  const stateDir = mkdtempSync(join(tmpdir(), "agent-settings-"));
  return { stateDir, settings: createAgentSettings({ stateDir, env, project: "brigade", now: () => new Date("2026-11-25T10:00:00.000Z") }) };
};
type Settings = ReturnType<typeof fresh>["settings"];
const get = async (settings: Settings, agent: string) => (await settings.handle({ method: "GET", path: `/api/agents/${agent}/settings` })).body as { fields: Field[] };
const fieldOf = async (settings: Settings, agent: string, key: string) => (await get(settings, agent)).fields.find((f) => f.key === key);
// `null`: a request with no author.
const put = (settings: Settings, agent: string, body: unknown, author: string | null = "chef") =>
  settings.handle({ method: "PUT", path: `/api/agents/${agent}/settings`, body, ...(author === null ? {} : { author }) });
const reasonOf = (body: unknown) => (body as { reason: string }).reason;

test("the environment's value is read in the setting's kind; an empty variable is no value", async () => {
  const { settings } = fresh({ BRIGADE_DRIFT_TICKET_TOKENS: "500000", BRIGADE_DRIFT_GATES_SECONDS: "12.5", BRIGADE_REVIEWER_MODEL: "" });
  assert.deepEqual(await fieldOf(settings, "closer", "driftTicketTokens"), { key: "driftTicketTokens", label: "Drift: tokens of the most expensive ticket", kind: "integer", value: 500_000, source: "env", editable: true, changedAt: null, changedBy: null });
  assert.equal(settings.read("closer", "driftGatesSeconds"), 12.5);
  assert.equal(settings.read("closer", "driftLostTokens"), null);
  assert.equal((await fieldOf(settings, "closer", "driftLostTokens"))?.source, "default");
  assert.equal(settings.read("reviewer", "model"), "opus");
  assert.equal((await fieldOf(settings, "reviewer", "model"))?.source, "default");
});

test("an autonomy level is its default until the app sets it, then the app's, with its author and instant", async () => {
  const { settings } = fresh();
  assert.deepEqual(await fieldOf(settings, "closer", "autonomy"), { key: "autonomy", label: "Autonomy level", kind: "autonomy", value: "propose", source: "default", editable: true, changedAt: null, changedBy: null });
  const res = await put(settings, "closer", { key: "autonomy", value: "observe" }, "alice");
  assert.deepEqual(res, { status: 200, body: { key: "autonomy", label: "Autonomy level", kind: "autonomy", value: "observe", source: "app", editable: true, changedAt: "2026-11-25T10:00:00.000Z", changedBy: "alice" } });
  assert.equal(settings.read("closer", "autonomy"), "observe");
  assert.deepEqual(settings.overrides(), {}, "an autonomy level replaces no variable");
});

test("only the variables the app set are overlaid, as text", async () => {
  const { settings } = fresh({ BRIGADE_MANAGER_MODEL: "sonnet" });
  assert.deepEqual(settings.overrides(), {});
  assert.equal((await put(settings, "closer", { key: "driftLostTokens", value: 1000 })).status, 200);
  assert.equal((await put(settings, "manager", { key: "effort", value: "low" })).status, 200);
  assert.deepEqual(settings.overrides(), { BRIGADE_DRIFT_LOST_TOKENS: "1000", BRIGADE_MANAGER_EFFORT: "low" });
});

test("a setting that lives outside the app is refused with where it lives, and its kind still checks the value", async () => {
  const { settings } = fresh();
  const pause = await put(settings, "manager", { key: "pause", value: true });
  assert.equal(pause.status, 400);
  assert.match(reasonOf(pause.body), /manager's pause is not editable from the app: it lives in the project switch/);
  assert.match(reasonOf((await put(settings, "manager", { key: "pause", value: "yes" })).body), /pause must be true or false/);
  const places = await put(settings, "cook", { key: "places", value: 3 });
  assert.match(reasonOf(places.body), /cook's places is not editable from the app: it lives in each station's configuration/);
  assert.match(reasonOf((await put(settings, "cook", { key: "places", value: 1.5 })).body), /places must be a whole number of 0 or more/);
  assert.equal((await fieldOf(settings, "cook", "model"))?.label, "Model");
  assert.equal((await fieldOf(settings, "cook", "effort"))?.label, "Effort");
});

test("each value a setting refuses, and each request that cannot be read, is a 400 with its reason", async () => {
  const { stateDir, settings } = fresh();
  const cases: Array<[string, unknown, RegExp, (string | null)?]> = [
    ["manager", { key: "effort", value: "huge" }, /effort must be one of low, medium, high, xhigh, max/],
    ["closer", { key: "driftTicketTokens", value: 0 }, /must be a whole number of 1 or more/],
    ["closer", { key: "driftTicketTokens", value: "300000" }, /must be a whole number of 1 or more/],
    ["closer", { key: "driftGatesSeconds", value: 0 }, /must be a number greater than zero/],
    ["closer", { key: "driftGatesSeconds", value: "10" }, /must be a number greater than zero/],
    ["closer", { key: "driftGatesSeconds", value: Number.POSITIVE_INFINITY }, /must be a number greater than zero/],
    ["manager", { key: "colour", value: "red" }, /manager has no setting "colour": model, effort, autonomy, splitEpicAutonomy, pause/],
    ["manager", "model=opus", /must be \{key, value\}/],
    ["manager", { key: 3, value: "opus" }, /must be \{key, value\}/],
    ["manager", { key: "model" }, /must be \{key, value\}/],
    ["manager", { key: "model", value: "opus" }, /names no author/, " "],
  ];
  for (const [agent, body, reason, author] of cases) {
    const res = await put(settings, agent, body, author);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(reasonOf(res.body), reason);
  }
  assert.equal((await put(settings, "manager", { key: "model", value: "opus" }, null)).status, 400);
  assert.throws(() => readFileSync(join(stateDir, "agent-settings.json")), /ENOENT/, "nothing was written");
  // The valid ones pass.
  assert.equal((await put(settings, "closer", { key: "driftTicketTokens", value: 1 })).status, 200);
  assert.equal((await put(settings, "closer", { key: "driftGatesSeconds", value: 0.5 })).status, 200);
});

test("an unknown agent or route is a 404, another method a 405", async () => {
  const { settings } = fresh();
  assert.equal((await settings.handle({ method: "GET", path: "/api/agents/chef/settings" })).status, 404);
  assert.equal((await settings.handle({ method: "GET", path: "/api/agents/manager" })).status, 404);
  assert.equal((await settings.handle({ method: "DELETE", path: "/api/agents/manager/settings" })).status, 405);
  assert.equal((await settings.handle({ method: "GET", path: "/api/agents/design%2Dcook/settings" })).status, 200);
  assert.throws(() => settings.read("manager", "colour"), /no setting manager\/colour/);
  assert.throws(() => settings.read("chef", "model"), /no setting chef\/model/);
});

test("a settings file that cannot be read is refused by the read and by the write, and never overwritten", async () => {
  for (const content of ["{not json", "[]", '{"manager": 3}', '{"manager": {"model": {"value": "opus", "changedAt": "2026-11-25T10:00:00.000Z"}}}', '{"manager": {"model": {"value": "gpt", "changedAt": "2026-11-25T10:00:00.000Z", "changedBy": "chef"}}}', '{"manager": {"model": {"value": "opus", "changedAt": 1, "changedBy": "chef"}}}', '{"manager": {"model": "opus"}}']) {
    const { stateDir, settings } = fresh();
    const file = join(stateDir, "agent-settings.json");
    writeFileSync(file, content);
    const read = await settings.handle({ method: "GET", path: "/api/agents/manager/settings" });
    assert.equal(read.status, 500, content);
    assert.match(reasonOf(read.body), /agent-settings\.json/);
    assert.equal((await put(settings, "manager", { key: "model", value: "opus" })).status, 500, content);
    assert.equal(readFileSync(file, "utf8"), content);
    assert.throws(() => settings.read("manager", "model"), /cannot be read|no setting set from the app|not an object|is not a JSON object/);
  }
  // An entry of a setting this runtime does not know is kept as it is, and read without error.
  const { stateDir, settings } = fresh();
  writeFileSync(join(stateDir, "agent-settings.json"), '{"manager": {"gone": {"value": 1, "changedAt": "2026-11-25T10:00:00.000Z", "changedBy": "chef"}}, "chef": {"x": {"value": 1, "changedAt": "2026-11-25T10:00:00.000Z", "changedBy": "chef"}}}');
  assert.equal((await put(settings, "manager", { key: "model", value: "haiku" })).status, 200);
  assert.deepEqual(JSON.parse(readFileSync(join(stateDir, "agent-settings.json"), "utf8")).manager.gone, { value: 1, changedAt: "2026-11-25T10:00:00.000Z", changedBy: "chef" });
});
