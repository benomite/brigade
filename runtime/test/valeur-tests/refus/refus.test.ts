// Le registre des tests que le chef a refusé de retirer.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cheminDesRefus, ouvrirRefus } from "../../../src/valeur-tests/refus/registre.ts";
import { repertoireTemporaire } from "../../outils.ts";

const REGISTRE = new URL("../../../src/valeur-tests/refus/registre.ts", import.meta.url).pathname;

test("un test refusé l'est, et aucun autre", (t) => {
  const refus = ouvrirRefus(repertoireTemporaire(t));
  assert.equal(refus.isRefused("a.test.js > does x"), false);
  refus.refuse("a.test.js > does x");
  assert.equal(refus.isRefused("a.test.js > does x"), true);
  assert.equal(refus.isRefused("a.test.js > does y"), false);
  assert.equal(refus.isRefused("b.test.js > does x"), false);
});

test("refuser deux fois le même test garde une entrée, à la première date", (t) => {
  const dates = [new Date("2026-01-01T00:00:00Z"), new Date("2026-02-02T00:00:00Z")];
  const refus = ouvrirRefus(repertoireTemporaire(t), () => dates.shift() ?? new Date());
  refus.refuse("a.test.js > does x", "kept on purpose");
  refus.refuse("a.test.js > does x", "other reason");
  assert.deepEqual(refus.listRefused(), [{ test: "a.test.js > does x", refused_at: "2026-01-01T00:00:00.000Z", reason: "kept on purpose" }]);
});

test("filterProposable écarte les refusés et garde l'ordre", (t) => {
  const refus = ouvrirRefus(repertoireTemporaire(t));
  refus.refuse("b");
  assert.deepEqual(refus.filterProposable(["c", "b", "a"]), ["c", "a"]);
  assert.deepEqual(ouvrirRefus(repertoireTemporaire(t)).filterProposable(["c", "b"]), ["c", "b"]);
});

test("le registre survit à un redémarrage : un autre process relit les entrées", (t) => {
  const etat = repertoireTemporaire(t);
  ouvrirRefus(etat).refuse("a.test.js > does x", "why");
  const script = `import { ouvrirRefus } from ${JSON.stringify(REGISTRE)}; console.log(JSON.stringify(ouvrirRefus(process.argv[1]).listRefused()));`;
  const sortie = spawnSync(process.execPath, ["--input-type=module", "-e", script, etat], { encoding: "utf8" });
  assert.equal(sortie.status, 0, sortie.stderr);
  const entrees = JSON.parse(sortie.stdout);
  assert.equal(entrees.length, 1);
  assert.equal(entrees[0].test, "a.test.js > does x");
  assert.equal(entrees[0].reason, "why");
});

test("le fichier est du JSON indenté que le chef relit", (t) => {
  const etat = repertoireTemporaire(t);
  ouvrirRefus(etat).refuse("a > b");
  const texte = readFileSync(cheminDesRefus(etat), "utf8");
  assert.match(texte, /^\{\n {2}"version": 1,\n {2}"refused": \[\n/);
  assert.ok(texte.endsWith("\n"));
});
