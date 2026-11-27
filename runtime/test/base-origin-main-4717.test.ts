// L'étape `Base origin/main` (#4717) : un fetch qui échoue sur un incident passager ne doit pas rougir main, et la
// refspec est forcée (`+`) — sans quoi main qui avance pendant le run rend le fetch non-fast-forward, à chaque essai.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

for (const fichier of ["tests.yml", "runtime-windows.yml"]) {
  test(`${fichier}: Base origin/main retries a forced fetch`, () => {
    const yml = readFileSync(join(import.meta.dirname, "../../.github/workflows", fichier), "utf8");
    const pas = /- name: Base origin\/main\n([\s\S]*?)(?=^ {6}- )/m.exec(yml)?.[1] ?? assert.fail("no Base origin/main step");
    assert.match(pas, /for essai in 1 2 3/, "the fetch is retried");
    assert.match(pas, /git fetch .* origin \+main:refs\/remotes\/origin\/main && exit 0/, "the refspec is forced with +");
    assert.doesNotMatch(pas, /origin main:refs/, "no unforced refspec");
    assert.match(pas, /exit 1/, "a persistent failure still fails the step");
  });
}
