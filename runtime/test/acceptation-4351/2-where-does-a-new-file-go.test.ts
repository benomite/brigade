// #4351, critère 2 : code-layout.md a une section « Where does a new file go? » avec une règle applicable.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const RACINE = new URL("../../../", import.meta.url);

test("code-layout.md has the 'Where does a new file go?' rule", () => {
  const url = new URL("docs/runtime/code-layout.md", RACINE);
  assert.ok(existsSync(url), "docs/runtime/code-layout.md does not exist");
  const texte = readFileSync(url, "utf8");
  const titre = /^#+\s*Where does a new file go\?\s*$/m.exec(texte);
  assert.ok(titre, "no section 'Where does a new file go?'");
  const reste = texte.slice(titre.index + titre[0].length);
  const section = reste.split(/^#{1,2}\s/m)[0]!;
  assert.match(section, /main\.ts/);
  assert.match(section, /status\.ts/);
  assert.match(section, /npm scripts?/i);
  assert.match(section, /never/i);
  assert.match(section, /runtime\/src/);
  assert.match(section, /director(y|ies)/i);
});
