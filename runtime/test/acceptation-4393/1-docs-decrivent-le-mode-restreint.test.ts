// #4393, critère 1 : les pages de docs décrivent le mode restreint du cook sans bac à sable, et aucune ne le dit
// sans bornes ni sans garde. Les docs sont lues depuis le dépôt ; les liens relatifs de ces pages doivent exister.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "..", "..", "..");
const lire = (page: string) => readFileSync(join(RACINE, page), "utf8");
const PAGES = ["docs/runtime/bac-a-sable.md", "docs/limites-du-cook.md", "docs/runtime/station-cook.md"];

test("the sandbox and chef pages describe restricted mode, and no page calls the unsandboxed cook unbounded", () => {
  const bac = lire(PAGES[0]);
  const limites = lire(PAGES[1]);
  assert.match(bac, /restricted mode/i, "bac-a-sable.md describes restricted mode");
  assert.match(bac, /dontAsk/, "bac-a-sable.md names the dontAsk permission mode");
  assert.match(limites, /restricted mode: no sandbox/, "limites-du-cook.md carries the wording");
  assert.match(limites, /continue without sandbox/, "limites-du-cook.md names the decision");
  assert.match(lire(PAGES[2]), /restricted mode/i, "station-cook.md points to restricted mode");

  for (const page of PAGES) {
    const texte = lire(page);
    assert.doesNotMatch(texte, /unsandboxed[^.\n]*\b(unbounded|unrestricted|without (any )?guard)/i, `${page} claims no bounds`);
    assert.doesNotMatch(texte, /no sandbox[^.\n]*\b(unbounded|unrestricted|without (any )?guard)/i, `${page} claims no bounds`);
    for (const [, cible] of texte.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)) {
      assert.ok(existsSync(join(RACINE, dirname(page), cible)), `${page}: broken link ${cible}`);
    }
  }
});
