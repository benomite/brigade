// #4222, critère 2 : PUT stocke une valeur valide et renvoie le champ mis à jour, changedAt posé et changedBy = auteur de la requête.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAgentSettings } from "../../src/agent-settings/index.ts";

const fresh = (env: Record<string, string> = {}) =>
  createAgentSettings({ stateDir: mkdtempSync(join(tmpdir(), "settings-")), env });

test("PUT stores a valid value and returns the updated field with its audit", async () => {
  const s = fresh();
  const avant = Date.now();
  const res = await s.handle({
    method: "PUT",
    path: "/api/agents/manager/settings",
    body: { key: "autonomy", value: "propose" },
    author: "benoit@bobl.fr",
  });
  assert.equal(res.status, 200);
  const f = res.body as Record<string, unknown>;
  assert.equal(f.key, "autonomy");
  assert.equal(f.value, "propose");
  assert.equal(f.source, "app");
  assert.equal(f.changedBy, "benoit@bobl.fr");
  assert.ok(Date.parse(String(f.changedAt)) >= avant - 1000);

  const lu = await s.handle({ method: "GET", path: "/api/agents/manager/settings" });
  const champ = (lu.body as { fields: Array<Record<string, unknown>> }).fields.find((x) => x.key === "autonomy");
  assert.equal(champ?.value, "propose");
  assert.equal(champ?.changedBy, "benoit@bobl.fr");
});
