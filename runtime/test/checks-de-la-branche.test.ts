// Les checks de la branche d'intégration et ce qui s'en dit (`checks-de-la-branche.ts`), gardés de la réparation
// automatique de main que #3945 retire : lequel ne retient rien, et la fin utile de son journal de job, que le
// dossier du superviseur porte (`superviseur/dossier.ts`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { estInformatif, sortieDErreur } from "../src/checks-de-la-branche.ts";

test("the error output keeps the end of the log up to its last error, truncated on a whole line", () => {
  const lignes = Array.from({ length: 500 }, (_, i) => `2026-11-04T16:40:00Z line ${i}`);
  const sortie = sortieDErreur([...lignes, "2026-11-04T16:41:00Z ##[error]boom", "2026-11-04T16:41:01Z Cleaning up"].join("\n"));
  const gardees = sortie.split("\n");
  assert.equal(gardees.length, 80);
  assert.equal(gardees.at(-1), "##[error]boom");
  assert.ok(!sortie.includes("Cleaning up"));

  const tronquee = sortieDErreur(lignes.join("\n"), 100);
  assert.ok(tronquee.length <= 102);
  assert.ok(tronquee.startsWith("…\nline "));
  assert.ok(tronquee.endsWith("line 499"));
});

test("the error output drops colors, timestamps, group markers and the blank lines around it; a short log is kept whole", () => {
  const journal = ["", "2026-11-04T16:40:00.123Z ##[group]Run npm test", "\u001b[31mnot ok 1\u001b[0m", "##[endgroup]", "2026-11-04T16:40:01Z ##[error]Process completed with exit code 1.", "", ""].join("\r\n");
  assert.equal(sortieDErreur(journal), "not ok 1\n##[error]Process completed with exit code 1.");
  assert.equal(sortieDErreur("one\ntwo"), "one\ntwo");
  assert.equal(sortieDErreur("\n\n"), "");
  // Une fin coupée sans saut de ligne se garde telle quelle.
  assert.equal(sortieDErreur("x".repeat(20), 10), `…\n${"x".repeat(10)}`);
});

test("only the Windows test jobs are informational (#2087); the `windows` job of publier-app is not (#3796)", () => {
  for (const name of ["windows tests (3/8)", "Windows App Tests", "windows app tests"]) assert.equal(estInformatif({ name, outcome: "red" }), true, name);
  for (const name of ["windows", "tests", "tests windows", undefined]) assert.equal(estInformatif({ name, outcome: "red" }), false, String(name));
});
