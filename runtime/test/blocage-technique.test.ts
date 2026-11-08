// Un refus de permission sur git fetch, merge ou rebase est un blocage
// technique : jamais `blocked-on-human` (#2952).
import assert from "node:assert/strict";
import { test } from "node:test";
import { A_LA_MAIN } from "../src/brigade-github.ts";
import { classerArret, labelsDeLArret } from "../src/blocage-technique.ts";

test("a permission denial on git fetch, merge or rebase is a technical block", () => {
  for (const commande of ["fetch", "merge", "rebase"]) {
    const arret = classerArret(`Permission to use Bash with command "git ${commande} origin main" was denied`);
    assert.deepEqual(arret, { genre: "technique", commande });
    assert.ok(!labelsDeLArret(arret).includes(A_LA_MAIN));
  }
});

test("a git option before the subcommand does not hide the denied command", () => {
  assert.deepEqual(classerArret("git -C /wt fetch origin: permission denied"), { genre: "technique", commande: "fetch" });
});

test("a genuine product or design question still yields blocked-on-human", () => {
  const arret = classerArret("Faut-il garder l'onglet Health ou le fondre dans Status ? Je ne peux pas trancher ce choix de design.");
  assert.deepEqual(arret, { genre: "question" });
  assert.deepEqual(labelsDeLArret(arret), [A_LA_MAIN]);
});

test("a git command without a denial, or a denial on another command, is not a technical block", () => {
  assert.deepEqual(classerArret("I ran git fetch and need to know which API shape you want"), { genre: "question" });
  assert.deepEqual(classerArret("Permission denied: npm install"), { genre: "question" });
});
