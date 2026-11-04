import { test } from "node:test";
import assert from "node:assert/strict";
import { EXCEPTIONS } from "./exceptions.ts";
import { chemin, gardesDuDepot, gardesDuFichier, jugerLesDurees, jugerLesGardes, fichiersDeTest, fichiersDuTitre, lignesChangees, racineDuRuntime, testTouche, valeur, verdict } from "./regle.ts";

test("aucune garde de plus de 2 s hors de la liste d'exceptions, et aucune exception de garde périmée", () => {
  const lus = new Set(fichiersDeTest().map((f) => chemin(racineDuRuntime, f)));
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

test("un test sauté ici mais encore écrit dans son fichier ne rend pas son exception périmée", () => {
  const exception = { file: "test/z.test.ts", test: "lent" };
  assert.deepEqual(jugerLesDurees([], [exception], joues("test/z.test.ts"), () => true), []);
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

test("sur une PR, un test lent ajouté ou changé échoue, nommé et chiffré ; un test lent inchangé est seulement rapporté", () => {
  const source = ['test("ancien lent", () => {', "  a();", "});", 'test("neuf lent", () => {', "  b();", "});"].join("\n");
  const diff = ["+++ b/test/z.test.ts", "@@ -4,0 +4,3 @@"].join("\n");
  const changees = lignesChangees(diff);
  assert.deepEqual([...(changees.get("test/z.test.ts") ?? [])], [4, 5, 6]);
  const touche = (m: { test: string }) => testTouche(m.test, source, changees.get("test/z.test.ts")!);
  const mesures = [
    { fichiers: ["test/z.test.ts"], test: "ancien lent", ms: 4000 },
    { fichiers: ["test/z.test.ts"], test: "neuf lent", ms: 3010 },
  ];
  const { echecs, rapport } = verdict(mesures, [], joues("test/z.test.ts"), () => true, { genre: "pr", touche });
  assert.equal(echecs.length, 1);
  assert.match(echecs[0] ?? "", /neuf lent.*3010 ms.*2000 ms/);
  assert.equal(rapport.length, 1);
  assert.match(rapport[0] ?? "", /ancien lent.*4000 ms/);
});

test("sur une PR, changer le corps d'un test lent le rend jugé", () => {
  const source = ['test("lent", () => {', "  a();", "});", 'test("autre", () => {});'].join("\n");
  assert.equal(testTouche("lent", source, new Set([2])), true);
  assert.equal(testTouche("autre", source, new Set([2])), false);
});

test("sur main, les tests de plus de 2 s sont rapportés avec leur durée et rien n'échoue ; sans mode, tout échoue", () => {
  const mesures = [{ fichiers: ["test/z.test.ts"], test: "lent", ms: 2500 }];
  const main = verdict(mesures, [], joues("test/z.test.ts"), () => true, { genre: "main" });
  assert.deepEqual(main.echecs, []);
  assert.equal(main.rapport.length, 1);
  assert.match(main.rapport[0] ?? "", /lent.*2500 ms/);
  const strict = verdict(mesures, [], joues("test/z.test.ts"), () => true, { genre: "strict" });
  assert.equal(strict.echecs.length, 1);
  assert.deepEqual(strict.rapport, []);
});
