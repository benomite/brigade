// #4351, critère 4 : chaque lien relatif de code-layout.md et de README.md pointe vers un fichier existant.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const DOSSIER = new URL("../../../docs/runtime/", import.meta.url);

test("every relative link in code-layout.md and README.md resolves", () => {
  assert.ok(existsSync(new URL("code-layout.md", DOSSIER)), "code-layout.md does not exist");
  for (const page of ["code-layout.md", "README.md"]) {
    const texte = readFileSync(new URL(page, DOSSIER), "utf8");
    const liens = [...texte.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!).filter((l) => !/^([a-z]+:|#|\/\/)/i.test(l));
    for (const lien of liens) {
      const cible = new URL(lien.split("#")[0] || ".", DOSSIER);
      assert.ok(existsSync(cible), `${page}: broken link ${lien}`);
    }
  }
});
