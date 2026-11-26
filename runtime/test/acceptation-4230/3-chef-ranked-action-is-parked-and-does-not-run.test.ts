// Test d'acceptation gelé (#4230), critère 3. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/risque/risque.ts` exporte `lireFicheDuProjet(dossier)` (lit `<dossier>/.claude/brigade/projet.json` à chaque appel, {} s'il est absent ;
// le classement est le champ `risk`, genre -> "chef" | "safe") et `ouvrirLePass({ dossier, parquer(item) })` ->
// { soumettre({ ticket, genre, description, executer }): Promise<"executee" | "parquee">, parquees(): item[], repondre(id): Promise<void> }.
// Un item parqué : { id, ticket, genre, texte } ; `texte` dit ce que l'action fera (il contient `description`).
// La fiche est relue à chaque `soumettre`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirLePass } from "../../src/risque/risque.ts";

test("an action of a kind ranked 'chef' is parked at the pass with what it will do, and does not run", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "risque-"));
  mkdirSync(join(dossier, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(dossier, ".claude", "brigade", "projet.json"), JSON.stringify({ version: 1, risk: { publish: "chef" } }));
  const pourLeChef: unknown[] = [];
  const pass = ouvrirLePass({ dossier, parquer: (item: unknown) => void pourLeChef.push(item) });
  let lancee = 0;

  const issue = await pass.soumettre({ ticket: 7, genre: "publish", description: "publish the release notes of 1.4 on the blog", executer: async () => void (lancee += 1) });

  assert.equal(issue, "parquee");
  assert.equal(lancee, 0, "the action did not run");
  assert.equal(pass.parquees().length, 1);
  assert.equal(pourLeChef.length, 1);
  assert.match(pass.parquees()[0].texte, /publish the release notes of 1\.4 on the blog/);
});
