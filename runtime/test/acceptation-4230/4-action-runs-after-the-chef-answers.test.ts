// Test d'acceptation gelé (#4230), critère 4. Contrat : voir le test du critère 3 (`ouvrirLePass` de `runtime/src/risque/risque.ts`).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirLePass } from "../../src/risque/risque.ts";

test("after the chef answers on a parked action, the action runs", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "risque-"));
  mkdirSync(join(dossier, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(dossier, ".claude", "brigade", "projet.json"), JSON.stringify({ version: 1, risk: { pay: "chef" } }));
  const pass = ouvrirLePass({ dossier, parquer: () => {} });
  let lancee = 0;

  await pass.soumettre({ ticket: 8, genre: "pay", description: "pay the hosting invoice", executer: async () => void (lancee += 1) });
  assert.equal(lancee, 0);
  const [item] = pass.parquees();
  assert.ok(item, "the action is parked");

  await pass.repondre(item.id);

  assert.equal(lancee, 1, "the action ran once, after the answer");
  assert.equal(pass.parquees().length, 0, "nothing is left parked");
});
