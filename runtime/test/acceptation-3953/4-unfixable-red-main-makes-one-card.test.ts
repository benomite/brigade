// #3953, critère 4 : un `main` rouge que la cuisine ne peut pas réparer crée exactement une carte TODO ; une seconde
// évaluation du même rouge n'en crée pas une deuxième.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { evaluerMain } from "../../src/statuts-ci/regles.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

type R = { check: string; outcome: "red" | "green"; run: number };
const rouge = (check: string, run: number): R => ({ check, outcome: "red", run });
const statutsFixes = (parCible: Record<string, R[]>) => ({ resultats: async (cible: string) => parCible[cible] ?? [] });

test("a red main the kitchen cannot fix creates exactly one TODO card, even evaluated twice", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const statuts = statutsFixes({ main: [rouge("unit", 900)] });
  const entree = { statuts, journal, projet: "brigade", cuisinePeutReparer: async () => false };
  await evaluerMain(entree);
  assert.equal(cartesEnTodo(journal.base).length, 1);
  await evaluerMain(entree);
  assert.equal(cartesEnTodo(journal.base).length, 1);
});
