// Les rapports de temps de cuisson sont relus tels que #2675 les écrit.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FICHIER_DES_RATIOS, lireRatios } from "../../src/alerte-temps-cuisson/alerte.ts";

// Un projet dont projet.json porte `contenu`.
function projetAvec(contenu: object): string {
  const dossier = mkdtempSync(join(tmpdir(), "alerte-temps-cuisson-"));
  mkdirSync(join(dossier, ".claude/brigade"), { recursive: true });
  writeFileSync(join(dossier, ".claude/brigade/projet.json"), JSON.stringify(contenu));
  return dossier;
}


test("the recorded ratios are read as #2675 writes them, the most recent first, at most ten", (t) => {
  const dossier = projetAvec({});
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  assert.deepEqual(lireRatios(dossier), []);
  const ecrits = Array.from({ length: 12 }, (_, rang) => ({ ticket: 2600 + rang, servedAt: new Date(Date.UTC(2026, 10, 7, rang)).toISOString(), attendu: 10, reel: 10 + rang, ratio: (10 + rang) / 10 }));
  writeFileSync(join(dossier, FICHIER_DES_RATIOS), JSON.stringify([...ecrits, { ticket: "x" }, null]));
  const lus = lireRatios(dossier);
  assert.equal(lus.length, 10);
  assert.deepEqual(lus[0], { ticket: 2611, attendu: 10, reel: 21 });
  assert.equal(lus.at(-1)?.ticket, 2602);
});
