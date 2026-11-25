// #4222, critère 4 : après un PUT, la prochaine lecture par le code du runtime renvoie la nouvelle valeur, sans redémarrage.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings } from "../../src/agent-settings/index.ts";

test("the runtime reader sees the new value right after a PUT, on the same instance", async () => {
  const s = createAgentSettings({
    stateDir: mkdtempSync(join(tmpdir(), "settings-")),
    env: { BRIGADE_REVIEWER_EFFORT: "low" },
  });
  assert.equal(s.read("reviewer", "effort"), "low");
  const res = await s.handle({
    method: "PUT",
    path: "/api/agents/reviewer/settings",
    body: { key: "effort", value: "high" },
    author: "chef",
  });
  assert.equal(res.status, 200);
  assert.equal(s.read("reviewer", "effort"), "high");
});
