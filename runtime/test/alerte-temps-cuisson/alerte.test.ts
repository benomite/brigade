// L'alerte du temps de cuisson (#2676) : un ticket de correction quand la
// médiane des rapports réel / attendu dépasse `cookingOverEstimateMax` (1,5 par
// défaut), et jamais un second tant qu'il est ouvert.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FICHIER_DES_RATIOS, lireRatios, lireSeuil, medianeDesRatios, type RatioServi } from "../../src/alerte-temps-cuisson/alerte.ts";

// Un projet dont projet.json porte `contenu`.
function projetAvec(contenu: object): string {
  const dossier = mkdtempSync(join(tmpdir(), "alerte-temps-cuisson-"));
  mkdirSync(join(dossier, ".claude/brigade"), { recursive: true });
  writeFileSync(join(dossier, ".claude/brigade/projet.json"), JSON.stringify(contenu));
  return dossier;
}

// [ticket, attendu, réel], en minutes.
const ratios = (...lignes: [number, number | null, number][]): RatioServi[] => lignes.map(([ticket, attendu, reel]) => ({ ticket, attendu, reel }));

test("with cookingOverEstimateMax absent from projet.json, the threshold is 1.5", (t) => {
  const dossier = projetAvec({ version: 1, integrationBranch: "main" });
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  assert.equal(lireSeuil(dossier), 1.5);
  // Pas de projet.json du tout : le même défaut.
  assert.equal(lireSeuil(join(dossier, "ailleurs")), 1.5);
});

test("a custom cookingOverEstimateMax in projet.json replaces the default", (t) => {
  const dossier = projetAvec({ version: 1, cookingOverEstimateMax: 3 });
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  assert.equal(lireSeuil(dossier), 3);
});

test("the median ratio leaves out the tickets with no estimate", () => {
  // Trois tickets estimés à ×1, et quatre sans estimation qui ont cuit longtemps :
  // comptés, ils porteraient la médiane bien au-dessus du seuil.
  const sansEstimation = ratios([4, 10, 10], [5, 10, 10], [6, 10, 10], [7, null, 90], [8, null, 90], [9, 0, 90], [10, null, 90]);
  assert.equal(medianeDesRatios(sansEstimation), 1);
  // Aucun ticket estimé : pas de médiane.
  assert.equal(medianeDesRatios(ratios([11, null, 90])), null);
});

test("a malformed projet.json, or a cookingOverEstimateMax that is not a number over 0, falls back to 1.5 and says so", (t) => {
  const dossier = projetAvec({});
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const fichier = join(dossier, ".claude/brigade/projet.json");
  for (const contenu of ["{ not json", JSON.stringify({ cookingOverEstimateMax: 0 }), JSON.stringify({ cookingOverEstimateMax: -2 }), JSON.stringify({ cookingOverEstimateMax: "2" })]) {
    writeFileSync(fichier, contenu);
    const avertis: string[] = [];
    assert.equal(lireSeuil(dossier, (texte) => avertis.push(texte)), 1.5);
    assert.equal(avertis.length, 1, contenu);
    assert.match(avertis[0] ?? "", /falls back to 1\.5/);
  }
  // Absent, ou sans la clé : le défaut, en silence.
  const avertis: string[] = [];
  writeFileSync(fichier, JSON.stringify({ version: 1 }));
  assert.equal(lireSeuil(dossier, (texte) => avertis.push(texte)), 1.5);
  assert.equal(lireSeuil(join(dossier, "ailleurs"), (texte) => avertis.push(texte)), 1.5);
  assert.deepEqual(avertis, []);
});

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
