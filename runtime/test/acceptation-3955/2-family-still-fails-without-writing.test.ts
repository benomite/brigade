// #3955, critère 2 : chaque test de la famille échoue encore si les tests d'acceptation d'un ticket retenu ne sont
// pas écrits pendant sa retenue. Le fait attendu (étiquette « tests écrits » posée, ou écriture lancée) doit être
// observé AVANT que la retenue ne soit levée (`liberer()`), et le test garde son cook en vol jusque-là.
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
test("each test of the family sees the held ticket's tests written before the hold is released", () => {
  for (const fichier of FAMILLE) {
    const code = sansCommentaires(readFileSync(join(TESTS, fichier), "utf8"));
    const cas = code.split(/^test\(/m).slice(1);
    assert.ok(cas.length > 0, `${fichier} has a test`);
    for (const corps of cas) {
      const titre = `${fichier} : ${corps.slice(0, 60).split("\n")[0]}`;
      const liberation = corps.indexOf("liberer()");
      assert.ok(liberation > 0, `${titre} — it holds a cook and releases it at the end`);
      const avant = corps.slice(0, liberation);
      assert.match(avant, /let liberer/, `${titre} — a cook is held`);
      // Le fait observé pendant la retenue : l'étiquette des tests écrits d'un ticket retenu, ou son écriture lancée.
      const attentes = [...avant.matchAll(/jusqua\([\s\S]*?(?:LABEL_TESTS_ECRITS|ecritures\.includes)[\s\S]*?\);/g)];
      assert.ok(attentes.length > 0, `${titre} — it waits for the tests to be written before releasing the hold`);
      const derniere = attentes[attentes.length - 1]?.[0] ?? "";
      assert.match(derniere, /ticket\((?:20|2|50)\)|ecritures\.includes\(50\)/, `${titre} — the last wait is on the held ticket, not the one in flight`);
    }
  }
});
