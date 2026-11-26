// Test d'acceptation gelé (#4230), critère 6. Contrat : voir le test du critère 3 (`ouvrirLePass` de `runtime/src/risque/risque.ts`).
// Le même pass, sans redémarrage : seule la fiche du projet change entre les deux tickets.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirLePass } from "../../src/risque/risque.ts";

test("the chef changes one rank in the project sheet only: the next ticket gets the new rank, with no restart", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "risque-"));
  mkdirSync(join(dossier, ".claude", "brigade"), { recursive: true });
  const fiche = join(dossier, ".claude", "brigade", "projet.json");
  writeFileSync(fiche, JSON.stringify({ version: 1, risk: { "write-to-client": "chef" } }));
  const pass = ouvrirLePass({ dossier, parquer: () => {} });
  let lancees = 0;
  const action = (ticket: number) => ({ ticket, genre: "write-to-client", description: "write to the client", executer: async () => void (lancees += 1) });

  assert.equal(await pass.soumettre(action(10)), "parquee");
  assert.equal(lancees, 0);

  writeFileSync(fiche, JSON.stringify({ version: 1, risk: { "write-to-client": "safe" } }));

  assert.equal(await pass.soumettre(action(11)), "executee");
  assert.equal(lancees, 1);
  assert.equal(pass.parquees().length, 1, "only the first ticket's action stays parked");
});
