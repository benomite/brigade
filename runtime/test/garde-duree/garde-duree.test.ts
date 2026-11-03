import { test } from "node:test";
import assert from "node:assert/strict";
import { EXCEPTIONS } from "./exceptions.ts";
import { gardesDuDepot, gardesDuFichier, jugerLesDurees, jugerLesGardes, fichiersDeTest, fichiersDuTitre, racineDuRuntime, valeur } from "./regle.ts";
import { relative } from "node:path";

test("aucune garde de plus de 2 s hors de la liste d'exceptions, et aucune exception de garde périmée", () => {
  const lus = new Set(fichiersDeTest().map((f) => relative(racineDuRuntime, f)));
  const fautes = jugerLesGardes(gardesDuDepot(), EXCEPTIONS, lus);
  assert.deepEqual(fautes, []);
});

test("les exceptions sont uniques : une ligne par fautif", () => {
  const cles = EXCEPTIONS.map((e) => JSON.stringify(e));
  assert.equal(new Set(cles).size, cles.length);
});

test("valeur lit un littéral ou un produit de littéraux, rien d'autre", () => {
  assert.equal(valeur("60_000"), 60000);
  assert.equal(valeur("2 * 60 * 1000"), 120000);
  assert.equal(valeur("DELAI"), null);
  assert.equal(valeur("a * 5"), null);
});

test("une garde jusqua de 5000 ms est nommée avec son fichier et sa valeur", () => {
  const texte = `test("x", async () => {\n  await jusqua(() => fini(), 5000);\n});`;
  const fautes = jugerLesGardes(gardesDuFichier(texte, "test/x.test.ts"), [], new Set(["test/x.test.ts"]));
  assert.equal(fautes.length, 1);
  assert.match(fautes[0] ?? "", /test\/x\.test\.ts:2 : garde jusqua\(…, 5000\) = 5000 ms, la limite est 2000 ms/);
});

test("jusqua à plusieurs lignes, timeout et plafond littéraux sont vus ; 2000 ms et les commentaires ne le sont pas", () => {
  const texte = [
    "await jusqua(",
    "  () => lire(a, b),",
    "  2_500,",
    ");",
    "const options = { timeout: 60_000, plafond: 2000 };",
    "// timeout: 90_000",
    "await jusqua(() => ok(), 1500);",
  ].join("\n");
  const gardes = gardesDuFichier(texte, "test/y.test.ts").map((g) => g.garde);
  assert.deepEqual(gardes, ["jusqua(…, 2_500)", "timeout: 60_000"]);
});

test("une exception dont la garde a disparu est dite périmée", () => {
  const fautes = jugerLesGardes([], [{ file: "test/y.test.ts", garde: "timeout: 60_000" }], new Set(["test/y.test.ts"]));
  assert.equal(fautes.length, 1);
  assert.match(fautes[0] ?? "", /périmée.*timeout: 60_000.*test\/y\.test\.ts/);
});

const joues = (...f: string[]) => new Set(f);

test("un test de 3 s hors liste est nommé avec son fichier, sa durée et la limite de 2 s", () => {
  const fautes = jugerLesDurees([{ fichiers: ["test/z.test.ts"], test: "attend trois secondes", ms: 3010 }], [], joues("test/z.test.ts"));
  assert.equal(fautes.length, 1);
  assert.match(fautes[0] ?? "", /test\/z\.test\.ts.*attend trois secondes.*3010 ms.*2000 ms/);
});

test("un test de plus de 2 s qui est listé passe ; le même test disparu rend l'exception périmée", () => {
  const exception = { file: "test/z.test.ts", test: "lent" };
  assert.deepEqual(jugerLesDurees([{ fichiers: ["test/z.test.ts"], test: "lent", ms: 5000 }], [exception], joues("test/z.test.ts")), []);
  assert.deepEqual(jugerLesDurees([{ fichiers: ["test/z.test.ts"], test: "lent", ms: 300 }], [exception], joues("test/z.test.ts")), []);
  const disparu = jugerLesDurees([], [exception], joues("test/z.test.ts"));
  assert.equal(disparu.length, 1);
  assert.match(disparu[0] ?? "", /périmée.*lent.*test\/z\.test\.ts/);
});

test("une suite partielle ne juge pas les exceptions des fichiers qu'elle n'a pas joués", () => {
  assert.deepEqual(jugerLesDurees([], [{ file: "test/b.test.ts", test: "lent" }], joues("test/a.test.ts")), []);
});

test("le fichier d'un test se retrouve par son titre, même bâti", () => {
  const sources = new Map([
    ["test/a.test.ts", 'test("le titre exact de ce test, qui est long", () => {});'],
    ["test/b.test.ts", "for (const m of mots) test(`${m} : sa sortie ne porte aucun mot du glossaire`, () => {});"],
  ]);
  assert.deepEqual(fichiersDuTitre("le titre exact de ce test, qui est long", sources), ["test/a.test.ts"]);
  assert.deepEqual(fichiersDuTitre("`status` : sa sortie ne porte aucun mot du glossaire", sources), ["test/b.test.ts"]);
  assert.deepEqual(fichiersDuTitre("un titre que personne n'a écrit nulle part ici", sources), []);
});
