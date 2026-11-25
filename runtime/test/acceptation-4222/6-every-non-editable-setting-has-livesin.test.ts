// #4222, critère 6 : tout réglage non modifiable depuis l'app a un livesIn qui dit où il vit.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings } from "../../src/agent-settings/index.ts";

const AGENTS = ["second", "manager", "cook", "design-cook", "pass", "reviewer", "closer", "supervisor"];

test("every field with editable=false names where it lives, and editable fields carry no livesIn", async () => {
  const s = createAgentSettings({ stateDir: mkdtempSync(join(tmpdir(), "settings-")), env: {} });
  let nonEditable = 0;
  for (const id of AGENTS) {
    const res = await s.handle({ method: "GET", path: `/api/agents/${id}/settings` });
    assert.equal(res.status, 200, id);
    const { fields } = res.body as { fields: Array<Record<string, unknown>> };
    for (const f of fields) {
      if (f.editable === false) {
        nonEditable++;
        assert.ok(typeof f.livesIn === "string" && f.livesIn.trim().length > 0, `${id}/${String(f.key)} has no livesIn`);
      } else {
        assert.ok(f.livesIn === undefined || f.livesIn === null, `${id}/${String(f.key)} is editable but has livesIn`);
      }
    }
  }
  assert.ok(nonEditable > 0, "at least one setting lives outside the app");
});
