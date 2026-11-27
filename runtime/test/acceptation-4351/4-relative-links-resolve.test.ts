// #4351, critère 4 : chaque lien relatif des pages de docs/runtime/ pointe vers un fichier existant.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const DOSSIER = new URL("../../../docs/runtime/", import.meta.url);

test("every relative link of the pages of docs/runtime/ resolves", () => {
  const pages = readdirSync(DOSSIER).filter((page) => page.endsWith(".md"));
  assert.ok(pages.includes("README.md"), "docs/runtime/README.md does not exist");
  for (const page of pages) {
    const texte = readFileSync(new URL(page, DOSSIER), "utf8");
    const liens = [...texte.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!).filter((l) => !/^([a-z]+:|#|\/\/)/i.test(l));
    for (const lien of liens) {
      const cible = new URL(lien.split("#")[0] || ".", DOSSIER);
      assert.ok(existsSync(cible), `${page}: broken link ${lien}`);
    }
  }
});
