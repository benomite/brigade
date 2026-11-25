// #4222, critère 7 : chaque agent de la liste de l'épique a model, effort, autonomy et pause, ou un champ non modifiable qui dit où ils vivent.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings } from "../../src/agent-settings/index.ts";

const AGENTS = ["second", "manager", "cook", "design-cook", "pass", "reviewer", "closer", "supervisor"];

test("each agent exposes model, effort, autonomy and pause, or a non-editable field saying where they live", async () => {
  const s = createAgentSettings({ stateDir: mkdtempSync(join(tmpdir(), "settings-")), env: {} });
  for (const id of AGENTS) {
    const res = await s.handle({ method: "GET", path: `/api/agents/${id}/settings` });
    assert.equal(res.status, 200, id);
    const { fields } = res.body as { fields: Array<Record<string, unknown>> };
    for (const key of ["model", "effort", "autonomy", "pause"]) {
      const f = fields.find((x) => x.key === key);
      const ok = f !== undefined && (f.editable === true || (typeof f.livesIn === "string" && f.livesIn.length > 0));
      assert.ok(ok, `${id} has neither an editable ${key} nor a non-editable one with livesIn`);
    }
  }
});
