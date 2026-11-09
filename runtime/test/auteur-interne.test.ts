// Le robot du projet n'est pas un inconnu (#3088) : son issue va à la cuisine, jamais à la TODO du chef.
import assert from "node:assert/strict";
import { test } from "node:test";
import { auteurInterne } from "../src/auteur-interne.ts";
import { auteurSansEcriture } from "../src/github-etat/auteur.ts";

test("an issue by github-actions[bot] is not a stranger's issue, one by an unrelated user still is", () => {
  assert.equal(auteurSansEcriture({ association: "NONE", author: "github-actions[bot]" }), false);
  assert.equal(auteurSansEcriture({ association: "NONE", author: "GitHub-Actions" }), false);
  assert.equal(auteurSansEcriture({ association: "NONE", author: "intrus" }), true);
  assert.equal(auteurSansEcriture({ association: "NONE", author: "not-github-actions[bot]" }), true);
  assert.equal(auteurSansEcriture({ association: "NONE" }), true);
  assert.equal(auteurInterne(undefined), false);
});

test("the data of #3084 is not classified as a stranger's issue", () => {
  const issue = { association: "NONE", author: "github-actions[bot]", body: "The build failed.", title: "publier-app: app-v1.0.185 was not published, a build failed" };
  assert.equal(auteurSansEcriture(issue), false);
});
