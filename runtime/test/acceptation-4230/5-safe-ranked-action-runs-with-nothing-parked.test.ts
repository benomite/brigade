// Test d'acceptation gelé (#4230), critère 5. Contrat : voir le test du critère 3 (`ouvrirLePass` de `runtime/src/risque/risque.ts`).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirLePass } from "../../src/risque/risque.ts";

test("an action of a kind ranked 'safe' (fix a typo) runs with no item for the chef", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "risque-"));
  mkdirSync(join(dossier, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(dossier, ".claude", "brigade", "projet.json"), JSON.stringify({ version: 1, risk: { "fix-typo": "safe" } }));
  const pourLeChef: unknown[] = [];
  const pass = ouvrirLePass({ dossier, parquer: (item: unknown) => void pourLeChef.push(item) });
  let lancee = 0;

  const issue = await pass.soumettre({ ticket: 9, genre: "fix-typo", description: "fix a typo in the README", executer: async () => void (lancee += 1) });

  assert.equal(issue, "executee");
  assert.equal(lancee, 1);
  assert.equal(pass.parquees().length, 0, "nothing is parked");
  assert.equal(pourLeChef.length, 0, "nothing reaches the chef");
});
