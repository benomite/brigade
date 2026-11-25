// #4222, critère 3 : un PUT à valeur invalide renvoie 400 avec une raison et ne stocke rien.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings } from "../../src/agent-settings/index.ts";

const fresh = (env: Record<string, string> = {}) =>
  createAgentSettings({ stateDir: mkdtempSync(join(tmpdir(), "settings-")), env });

test("invalid values give 400 with a reason and leave the settings untouched", async () => {
  const s = fresh();
  const lire = async (id: string) =>
    JSON.stringify((await s.handle({ method: "GET", path: `/api/agents/${id}/settings` })).body);
  const avantCook = await lire("cook");
  const avantManager = await lire("manager");

  const cas: Array<[string, { key: string; value: unknown }]> = [
    ["manager", { key: "model", value: "not-a-model" }],
    ["manager", { key: "autonomy", value: "yolo" }],
    ["cook", { key: "places", value: -1 }],
  ];
  for (const [id, body] of cas) {
    const res = await s.handle({ method: "PUT", path: `/api/agents/${id}/settings`, body, author: "chef" });
    assert.equal(res.status, 400, `${body.key}=${String(body.value)}`);
    const reason = (res.body as { reason?: unknown }).reason;
    assert.ok(typeof reason === "string" && reason.length > 0, "a reason is given");
  }
  assert.equal(await lire("cook"), avantCook);
  assert.equal(await lire("manager"), avantManager);
});
