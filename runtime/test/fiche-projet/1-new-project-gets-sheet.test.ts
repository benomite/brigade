// #4237, critère 1 : un nouveau projet reçoit `.brigade/fiche-projet.json` avec les huit items, une étape et ses
// gates, et served = la branche principale.
// Test d'acceptation : `creerFiche(dossier, { branchePrincipale })` écrit la fiche par défaut dans le dépôt du projet.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { creerFiche } from "../../src/fiche-projet/index.ts";

const ITEMS = ["work", "stages", "tools", "rules", "risks", "served", "recurring", "humans"];

test("a new project gets .brigade/fiche-projet.json with the eight items, one stage with its gates, served = main", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "fiche-projet-"));
  await creerFiche(dossier, { branchePrincipale: "main" });
  const fiche = JSON.parse(readFileSync(join(dossier, ".brigade", "fiche-projet.json"), "utf8"));
  for (const item of ITEMS) assert.ok(item in fiche, `item « ${item} » missing from the sheet`);
  assert.equal(Array.isArray(fiche.stages), true, "stages is a list");
  assert.equal(fiche.stages.length, 1, "exactly one stage by default");
  assert.ok(Array.isArray(fiche.rules) && fiche.rules.length >= 1, "the stage's gates are listed in rules");
  assert.ok(JSON.stringify(fiche.served).includes("main"), "served is the main branch");
});
