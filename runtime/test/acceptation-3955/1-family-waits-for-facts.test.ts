// #3955, critère 1 : chaque test de la famille « tests d'acceptation écrits pendant la retenue » attend un fait,
// jamais un délai. Un test qui fixe lui-même sa garde (`jusqua(…, 1500)`) ou dort (`setTimeout`) rend rouge la CI
// Windows dès que le poste est lent : seule la garde par défaut de `jusqua` est admise.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const TESTS = join(import.meta.dirname, "..");
const FAMILLE = [
  "acceptation-3872/1-tests-written-while-held.test.ts",
  "acceptation-3887/1-tests-written-while-places-full.test.ts",
  "acceptation-3931/1-tests-written-while-held-as-before.test.ts",
  "tests-acceptation/ecriture-pendant-la-retenue.test.ts",
];

const sansCommentaires = (texte: string) => texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// brigade:guard
test("no test of the family fixes its own delay: it waits for a fact", () => {
  const fautes: string[] = [];
  for (const fichier of FAMILLE) {
    const code = sansCommentaires(readFileSync(join(TESTS, fichier), "utf8"));
    // Une garde littérale passée à `jusqua`, sur la même ligne ou à la fin de son appel.
    for (const m of code.matchAll(/\bjusqua\s*\([\s\S]*?,\s*(\d[\d_ *]*)\s*\)\s*;/g)) fautes.push(`${fichier} : jusqua(…, ${m[1]?.trim()})`);
    for (const m of code.matchAll(/\b(setTimeout|sleep|attendre|delai|timeout|plafond)\b\s*[(:=]\s*[^\n]*/g)) fautes.push(`${fichier} : ${m[0].trim()}`);
  }
  assert.deepEqual(fautes, []);
});
