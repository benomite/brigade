// Les appels de la box à GitHub, comptés par projet et par sorte de lecture, sur l'heure glissante.
import assert from "node:assert/strict";
import { test } from "node:test";
import { direLesAppels, FENETRE_MS, lectureDe, ouvrirLimite } from "../src/limite-github.ts";

test("la sorte de lecture se lit dans le chemin de l'appel ; un geste est un geste", () => {
  assert.equal(lectureDe(["repos/o/r/issues/12/comments?per_page=100"]), "issue-comments");
  assert.equal(lectureDe(["repos/o/r/pulls/12"]), "pull-requests");
  assert.equal(lectureDe(["repos/o/r/issues?state=open"]), "issues");
  assert.equal(lectureDe(["-X", "PATCH", "/gists/abc", "--input", "-"]), "gist");
  assert.equal(lectureDe(["rate_limit"]), "other");
  assert.equal(lectureDe(["repos/o/r/pulls/12/merge"], "geste"), "gesture");
});

test("un mélange connu d'appels sur deux projets : le total et le plus gros projet et la plus grosse lecture sont exacts ; l'heure passée, ils sortent", () => {
  let instant = 1_000_000;
  const limite = ouvrirLimite({ maintenant: () => instant });
  const prendre = (projet: string, lecture: "issues" | "gist" | "issue-comments", n: number) => {
    for (let i = 0; i < n; i++) limite.prendre("cuisine", undefined, { projet, lecture });
  };
  prendre("alpha", "issues", 3);
  prendre("alpha", "issue-comments", 1);
  prendre("beta", "issues", 2);
  prendre("beta", "gist", 1);
  const r = limite.repartition();
  assert.equal(r.total, 7);
  assert.deepEqual(r.parProjet, [
    { nom: "alpha", appels: 4 },
    { nom: "beta", appels: 3 },
  ]);
  assert.deepEqual(r.parLecture[0], { nom: "issues", appels: 5 });
  assert.deepEqual(direLesAppels(r), ["7 calls in the last hour", "most calls: project alpha (4), kind issues (5)"]);

  instant += FENETRE_MS + 1;
  assert.equal(limite.repartition().total, 0);
  limite.fermer();
});
