// Ce que la fermeture repère dans les fichiers d'une branche, sans dépôt : des
// doublons — des lignes de code identiques de suite — et du code mort — des
// exports que rien ne référence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { repererCodeMort } from "../../src/closing/dead-code.ts";
import { LIGNES_MIN, repererDoublons } from "../../src/closing/duplicates.ts";

const code = (combien: number, nom = "etape") => Array.from({ length: combien }, (_, i) => `${nom}${i + 1}();`);
const fichier = (chemin: string, ...morceaux: string[][]) => ({ chemin, texte: `${morceaux.flat().join("\n")}\n` });

test("un doublon est une suite d'au moins huit lignes de code identiques, donnée entière avec ses deux passages", () => {
  assert.equal(LIGNES_MIN, 8);
  const doublons = repererDoublons([fichier("a.ts", ["avantA();"], code(12), ["apresA();"]), fichier("b.ts", ["avantB();", "encoreB();"], code(12), ["apresB();"]), fichier("c.ts", code(7))]);

  assert.deepEqual(doublons, [{ lignes: 12, passages: [{ chemin: "a.ts", debut: 2, fin: 13 }, { chemin: "b.ts", debut: 3, fin: 14 }] }]);
});

test("ni l'indentation, ni les lignes vides, ni les commentaires, ni les lignes de pure ponctuation ne font ou ne défont un doublon", () => {
  const [un, ...autres] = repererDoublons([
    fichier("a.ts", code(4), ["}", "", "// un commentaire de a"], code(4, "suite")),
    fichier("b.ts", code(4).map((ligne) => `    ${ligne}`), ["/* un autre, de b */", "});"], code(4, "suite")),
    // Sept lignes de code, et de quoi en faire neuf si la ponctuation comptait.
    fichier("c.ts", code(7, "autre"), ["}", "}"]),
    fichier("d.ts", code(7, "autre"), ["}", "}"]),
  ]);

  assert.deepEqual(un, { lignes: 8, passages: [{ chemin: "a.ts", debut: 1, fin: 11 }, { chemin: "b.ts", debut: 1, fin: 10 }] });
  assert.deepEqual(autres, []);
});

test("une troisième copie est donnée une fois, contre la première ; deux passages d'un même fichier ne se recouvrent pas ; les plus longs viennent d'abord", () => {
  const doublons = repererDoublons([
    fichier("a.ts", code(8), ["entreDeux();"], code(8), ["fin();"], code(10, "long")),
    fichier("b.ts", code(8), ["autreFin();"], code(10, "long")),
    // Seize fois la même ligne : un passage de huit, et sa copie plus bas.
    fichier("c.ts", Array.from({ length: 16 }, () => "pareil();")),
  ]);

  assert.deepEqual(doublons, [
    { lignes: 10, passages: [{ chemin: "a.ts", debut: 19, fin: 28 }, { chemin: "b.ts", debut: 10, fin: 19 }] },
    { lignes: 8, passages: [{ chemin: "a.ts", debut: 1, fin: 8 }, { chemin: "a.ts", debut: 10, fin: 17 }] },
    { lignes: 8, passages: [{ chemin: "b.ts", debut: 1, fin: 8 }, { chemin: "a.ts", debut: 1, fin: 8 }] },
    { lignes: 8, passages: [{ chemin: "c.ts", debut: 1, fin: 8 }, { chemin: "c.ts", debut: 9, fin: 16 }] },
  ]);
});

test("seuls les fichiers de code sont comparés : ni la doc, ni les données", () => {
  assert.deepEqual(repererDoublons([fichier("a.md", code(20)), fichier("b.md", code(20)), fichier("a.json", code(20)), fichier("b.json", code(20))]), []);
});

test("un export que rien ne référence est du code mort ; référencé par les seuls tests, il l'est hors des tests, et ils sont nommés", () => {
  const morts = repererCodeMort([
    { chemin: "src/a.ts", texte: "export function vivante() {}\n\nexport const MORTE = 1;\nexport async function eprouvee() {}\nexport type Oubliee = { a: number };\n" },
    { chemin: "src/b.ts", texte: 'import { vivante } from "./a.ts";\nvivante();\n' },
    { chemin: "test/a.test.ts", texte: 'import { eprouvee } from "../src/a.ts";\nawait eprouvee();\n' },
    { chemin: "src/a.spec.ts", texte: "eprouvee();\n" },
  ]);

  assert.deepEqual(morts, [
    { chemin: "src/a.ts", ligne: 3, nom: "MORTE", tests: [] },
    { chemin: "src/a.ts", ligne: 4, nom: "eprouvee", tests: ["src/a.spec.ts", "test/a.test.ts"] },
    { chemin: "src/a.ts", ligne: 5, nom: "Oubliee", tests: [] },
  ]);
});

test("un export dont son propre fichier se sert n'est pas mort, ni celui qu'un fichier qui n'est pas du code nomme ; la doc, elle, ne fait rien vivre", () => {
  const morts = repererCodeMort([
    { chemin: "src/a.ts", texte: "export const LOCALE = 1;\nexport function principal() {\n  return LOCALE;\n}\nexport class Lancee {}\nexport const enum Couleur { Rouge }\n" },
    { chemin: "package.json", texte: '{ "bin": "principal" }\n' },
    { chemin: "deploy/lanceur", texte: "#!/bin/sh\nnode -e 'new Lancee()'\n" },
    { chemin: "docs/a.md", texte: "`Couleur` est décrite ici.\n" },
  ]);

  assert.deepEqual(morts, [{ chemin: "src/a.ts", ligne: 6, nom: "Couleur", tests: [] }]);
});

test("l'aide d'un test, référencée par un autre test, n'est pas morte ; ni une déclaration d'ambiance, ni un export par défaut ne sont jugés", () => {
  const morts = repererCodeMort([
    { chemin: "test/aides/kitchen.ts", texte: "export function cuisine() {}\nexport function inutile() {}\n" },
    { chemin: "test/a.test.ts", texte: 'import { cuisine } from "./aides/kitchen.ts";\ncuisine();\n' },
    { chemin: "src/global.d.ts", texte: "export type Ambiance = string;\n" },
    { chemin: "src/page.tsx", texte: "export default function Page() {}\n" },
  ]);

  assert.deepEqual(morts, [{ chemin: "test/aides/kitchen.ts", ligne: 2, nom: "inutile", tests: [] }]);
});
