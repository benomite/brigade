// Ce que la livraison change à ses tests d'acceptation gelés depuis le gel
// (#3910) : la relecture le reçoit pour le juger, rien ne refuse la livraison
// avant elle. Sur un vrai dépôt git, sans station.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fichiersGeles, testsGelesTouches } from "../../src/passe-gel-tests/gel-tests.ts";
import { git, repertoireTemporaire } from "../outils.ts";

const GELE = "test/acceptation/critere-1.test.ts";
const AUTRE = "test/acceptation/critere-2.test.ts";

const ecrire = (depot: string, fichier: string, texte: string) => {
  mkdirSync(dirname(join(depot, fichier)), { recursive: true });
  writeFileSync(join(depot, fichier), texte);
};
const commiter = (depot: string, message: string, ...trailers: string[]) => {
  git(depot, "add", "-A");
  git(depot, "commit", "-q", "-m", message, ...trailers.flatMap((trailer) => ["-m", trailer]));
};

// Un dépôt dont `main` a un fichier, et une branche partie de lui.
function depot(t: TestContext): string {
  const racine = repertoireTemporaire(t);
  git(racine, "init", "-q", "-b", "main");
  ecrire(racine, "README.md", "base\n");
  commiter(racine, "base");
  git(racine, "checkout", "-q", "-b", "cook/1-github");
  return racine;
}
const geler = (racine: string) => {
  ecrire(racine, GELE, "assert.match(label(), /Exprot/);\n");
  ecrire(racine, AUTRE, "assert.ok(true);\n");
  commiter(racine, "test(#1): frozen acceptance tests", "Acceptance-Tests: frozen");
};

test("a frozen test the delivery changes is named, with its diff since the freeze; an untouched one is not", (t) => {
  const racine = depot(t);
  geler(racine);
  ecrire(racine, GELE, "assert.match(label(), /Export/);\n");
  ecrire(racine, "bouton.ts", "export const bouton = 1;\n");
  commiter(racine, "feat: the button");
  const touches = testsGelesTouches(racine, "main");
  assert.deepEqual(touches.fichiers, [GELE]);
  assert.match(touches.diff, /^-assert\.match\(label\(\), \/Exprot\/\);$/m);
  assert.match(touches.diff, /^\+assert\.match\(label\(\), \/Export\/\);$/m);
  assert.doesNotMatch(touches.diff, /bouton|critere-2/);
  assert.deepEqual(fichiersGeles(racine, "main").sort(), [GELE, AUTRE]);
});

test("a frozen test removed, or renamed, is named as changed", (t) => {
  const racine = depot(t);
  geler(racine);
  git(racine, "mv", GELE, "test/acceptation/renomme.test.ts");
  rmSync(join(racine, AUTRE));
  commiter(racine, "refactor: move the tests");
  assert.deepEqual(testsGelesTouches(racine, "main").fichiers.sort(), [GELE, AUTRE]);
});

test("a frozen test changed then put back byte for byte is untouched, whatever else the delivery changes", (t) => {
  const racine = depot(t);
  geler(racine);
  ecrire(racine, GELE, "assert.ok(false);\n");
  commiter(racine, "test: try");
  ecrire(racine, GELE, "assert.match(label(), /Exprot/);\n");
  ecrire(racine, "README.md", "changed\n");
  commiter(racine, "test: put it back");
  assert.deepEqual(testsGelesTouches(racine, "main"), { fichiers: [], diff: "" });
});

test("a branch whose first commit is not the frozen tests has no frozen test to touch", (t) => {
  const racine = depot(t);
  ecrire(racine, GELE, "assert.ok(1);\n");
  commiter(racine, "feat: first");
  ecrire(racine, GELE, "assert.ok(2);\n");
  commiter(racine, "feat: second", "Acceptance-Tests: frozen");
  assert.deepEqual(testsGelesTouches(racine, "main"), { fichiers: [], diff: "" });
  assert.deepEqual(fichiersGeles(racine, "main"), []);
});

test("a history that cannot be read throws: the station says so to the review instead of deciding", (t) => {
  const vide = repertoireTemporaire(t);
  assert.throws(() => testsGelesTouches(vide, "main"));
});
