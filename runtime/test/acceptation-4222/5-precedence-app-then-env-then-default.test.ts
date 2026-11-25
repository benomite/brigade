// #4222, critère 5 : l'ordre est valeur de l'app, puis variable d'environnement, puis défaut.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings } from "../../src/agent-settings/index.ts";

const fresh = (env: Record<string, string> = {}) =>
  createAgentSettings({ stateDir: mkdtempSync(join(tmpdir(), "settings-")), env });
const modelField = async (s: ReturnType<typeof fresh>) =>
  ((await s.handle({ method: "GET", path: "/api/agents/manager/settings" })).body as {
    fields: Array<Record<string, unknown>>;
  }).fields.find((f) => f.key === "model");

test("app value wins over the environment variable, which wins over the default", async () => {
  const sans = fresh();
  assert.ok(sans.read("manager", "model"), "a default exists");
  assert.equal((await modelField(sans))?.source, "default");

  const avecEnv = fresh({ BRIGADE_MANAGER_MODEL: "sonnet" });
  assert.equal(avecEnv.read("manager", "model"), "sonnet");
  assert.equal((await modelField(avecEnv))?.source, "env");

  const res = await avecEnv.handle({
    method: "PUT",
    path: "/api/agents/manager/settings",
    body: { key: "model", value: "opus" },
    author: "chef",
  });
  assert.equal(res.status, 200);
  assert.equal(avecEnv.read("manager", "model"), "opus");
  assert.equal((await modelField(avecEnv))?.source, "app");
});
