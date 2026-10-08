import assert from "node:assert/strict";
import { test } from "node:test";
import { horsZone, possede, recouvrement } from "../src/zones.ts";

test("un chemin possède le fichier qu'il nomme et tout ce qui est dessous, par segments entiers", () => {
  assert.equal(possede("runtime/src/rail.ts", "runtime/src/rail.ts"), true);
  assert.equal(possede("runtime/src", "runtime/src/rail.ts"), true);
  assert.equal(possede("runtime/src/", "runtime/src/projections/rail.ts"), true);
  assert.equal(possede("./runtime/src", "runtime/src/rail.ts"), true);
  // `runtime/src/rail` n'est pas le dossier de `runtime/src/rail.ts`.
  assert.equal(possede("runtime/src/rail", "runtime/src/rail.ts"), false);
  assert.equal(possede("runtime/src/rail.ts", "runtime/src"), false);
  assert.equal(possede("docs", "runtime/docs/a.md"), false);
  // La racine du dépôt possède tout.
  assert.equal(possede(".", "runtime/src/rail.ts"), true);
});

test("deux zones se recouvrent par un chemin égal, ou par un chemin qui contient l'autre — le plus précis est nommé", () => {
  assert.equal(recouvrement(["runtime/src/rail.ts"], ["docs", "runtime/src/rail.ts"]), "runtime/src/rail.ts");
  assert.equal(recouvrement(["runtime/src"], ["runtime/src/rail.ts"]), "runtime/src/rail.ts");
  assert.equal(recouvrement(["runtime/src/rail.ts"], ["runtime/"]), "runtime/src/rail.ts");
  assert.equal(recouvrement(["runtime/src/rail.ts"], ["runtime/src/rail.test.ts", "runtime/test"]), null);
  assert.equal(recouvrement([], ["runtime"]), null);
});

test("un chemin commun n'appartient à personne : il ne fait pas se recouvrir deux zones", () => {
  const communs = ["docs/runtime.md", "CHANGELOG.md"];
  assert.equal(recouvrement(["docs/runtime.md", "a.ts"], ["docs/runtime.md", "b.ts"], communs), null);
  assert.equal(recouvrement(["docs"], ["docs/runtime.md"], communs), null);
  // Un dossier qui contient un commun reste un dossier : deux tickets ne le possèdent pas ensemble.
  assert.equal(recouvrement(["docs"], ["docs"], communs), "docs");
  assert.equal(recouvrement(["docs"], ["docs/autre.md"], communs), "docs/autre.md");
  // Un dossier commun l'est avec tout ce qu'il contient.
  assert.equal(recouvrement(["docs/a.md"], ["docs/a.md"], ["docs/"]), null);
});

test("hors zone : les fichiers qu'aucun chemin de la zone ne possède, les communs mis à part", () => {
  const fichiers = ["runtime/src/rail.ts", "runtime/test/rail.test.ts", "docs/runtime.md", "README.md"];
  assert.deepEqual(horsZone(["runtime/src"], fichiers, ["docs/runtime.md"]), ["runtime/test/rail.test.ts", "README.md"]);
  assert.deepEqual(horsZone(["runtime", "README.md"], fichiers, ["docs"]), []);
});
