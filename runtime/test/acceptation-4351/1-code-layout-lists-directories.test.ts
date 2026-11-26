// #4351, critère 1 : docs/runtime/code-layout.md existe et liste chaque répertoire, avec la page de docs/runtime/
// qui décrit son sous-système et une phrase sur ce qui y va.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const RACINE = new URL("../../../", import.meta.url);
const DIRS = ["station","rail","github","pass","manager","bac-a-sable","second","cli"];

test("code-layout.md lists every directory with a docs/runtime page and a sentence", () => {
  const url = new URL("docs/runtime/code-layout.md", RACINE);
  assert.ok(existsSync(url), "docs/runtime/code-layout.md does not exist");
  const lignes = readFileSync(url, "utf8").split("\n");
  for (const dir of DIRS) {
    const ligne = lignes.find((l) => l.includes(`${dir}/`) && /\.md/.test(l));
    assert.ok(ligne, `no line naming ${dir}/ with a docs page`);
    const sansLiens = ligne.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/`[^`]*`/g, "");
    assert.ok(/[A-Za-z]+(\s+[A-Za-z']+){3,}/.test(sansLiens), `no sentence for ${dir}/`);
  }
});
