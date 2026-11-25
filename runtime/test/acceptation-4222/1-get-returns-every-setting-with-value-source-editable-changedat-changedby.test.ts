// #4222, critère 1 : GET /api/agents/:id/settings renvoie chaque réglage de l'agent avec value, source, editable, changedAt et changedBy.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings } from "../../src/agent-settings/index.ts";

const fresh = (env: Record<string, string> = {}) =>
  createAgentSettings({ stateDir: mkdtempSync(join(tmpdir(), "settings-")), env });

test("GET returns fields with the contract shape for the manager", async () => {
  const s = fresh({ BRIGADE_MANAGER_MODEL: "opus" });
  const res = await s.handle({ method: "GET", path: "/api/agents/manager/settings" });
  assert.equal(res.status, 200);
  const { fields } = res.body as { fields: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(fields) && fields.length > 0);
  for (const f of fields) {
    for (const k of ["key", "label", "kind", "value", "source", "editable", "changedAt", "changedBy"]) {
      assert.ok(k in f, `field ${String(f.key)} lacks ${k}`);
    }
    assert.ok(["app", "env", "default"].includes(String(f.source)));
    assert.equal(typeof f.editable, "boolean");
    assert.ok(f.changedAt === null || !Number.isNaN(Date.parse(String(f.changedAt))));
    assert.ok(f.changedBy === null || typeof f.changedBy === "string");
  }
  const model = fields.find((f) => f.key === "model");
  assert.equal(model?.value, "opus");
  assert.equal(model?.source, "env");
  assert.equal(model?.changedAt, null);
  assert.equal(model?.changedBy, null);
});
