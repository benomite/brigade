// #3984, critère 1 : le routage de `autonomie/` que rien n'appelle a disparu.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

const src = (chemin: string) => new URL(`../../src/${chemin}`, import.meta.url);

test("the autonomy routing (decision/aiguillage.ts and its facts) and the table nothing calls no longer exist", () => {
  for (const chemin of ["autonomie/decision/aiguillage.ts", "autonomie/decision/evenements.ts", "autonomie/table.ts"]) {
    assert.equal(existsSync(src(chemin)), false, `${chemin} is dead code and must be deleted`);
  }
});
