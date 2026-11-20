// #3962, critère 4 : la suite du runtime passe avec la règle posée. Ce test garde les deux textes que le ticket
// change : la section de docs/runtime/pass.md, et le texte de revue (« un cook ne les modifie … ») qui nomme l'exception.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { consigneDeRelecture, type Relecture } from "../../src/reviewer.ts";

const PASS = readFileSync(new URL("../../../docs/runtime/pass.md", import.meta.url), "utf8");

test("pass.md states the rule that a gesture the manager asks of a cook is never a blocking point, and the review's frozen-test text names the exception", () => {
  const section = PASS.split(/^#{1,4} /m).find((bloc) => /manager/i.test(bloc) && /asks/i.test(bloc) && /never[^.]*blocking/i.test(bloc));
  assert.ok(section !== undefined, "pass.md has a section stating the rule");
  assert.ok(section.length < 2_500, "and it stays short");
  const mission = { depot: "o/r", base: "main", ticket: { number: 1, title: "t", body: "b" }, commentaires: [], compteRendu: null, diff: { fichiers: ["a.ts"], texte: "+x" }, criteres: [], testsGeles: { fichiers: ["t/a.test.ts"], diff: "+x" } } as unknown as Relecture;
  const phrase = consigneDeRelecture(mission).split("\n").find((ligne) => /un cook ne les modifie/.test(ligne)) ?? "";
  assert.match(phrase, /sauf|à moins|exception/i, "the review text that forbids edits to frozen tests names the exception");
});
