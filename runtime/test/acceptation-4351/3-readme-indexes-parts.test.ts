// #4351, critère 3 : docs/runtime/README.md indexe les parties par répertoire, avec un lien vers leur page
// et vers code-layout.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const RACINE = new URL("../../../", import.meta.url);
const DIRS = ["station","rail","github","pass","manager","bac-a-sable","second","cli"];

test("README.md indexes each directory with a link to its page and to code-layout.md", () => {
  const texte = readFileSync(new URL("docs/runtime/README.md", RACINE), "utf8");
  assert.match(texte, /\]\((\.\/)?code-layout\.md(#[^)]*)?\)/, "no link to code-layout.md");
  for (const dir of DIRS) {
    const lignes = texte.split("\n").filter((l) => l.includes(`${dir}/`));
    assert.ok(lignes.length > 0, `${dir}/ is not in the index`);
    assert.ok(
      lignes.some((l) => /\]\([^)#]+\.md(#[^)]*)?\)/.test(l)),
      `${dir}/ has no link to a page`,
    );
  }
});
