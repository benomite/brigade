// #3953, critère 5 : quand `main` repasse au vert, la carte de ce rouge sort de TODO, comme sortent les cartes TODO
// existantes (`todo.left`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { evaluerMain } from "../../src/statuts-ci/regles.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

type R = { check: string; outcome: "red" | "green"; run: number };
const rouge = (check: string, run: number): R => ({ check, outcome: "red", run });
const vert = (check: string, run: number): R => ({ check, outcome: "green", run });
const statutsFixes = (parCible: Record<string, R[]>) => ({ resultats: async (cible: string) => parCible[cible] ?? [] });

test("when main turns green again the card of that red leaves TODO", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const base = { journal, projet: "brigade", cuisinePeutReparer: async () => false };
  await evaluerMain({ ...base, statuts: statutsFixes({ main: [rouge("unit", 900)] }) });
  assert.equal(cartesEnTodo(journal.base).length, 1);
  await evaluerMain({ ...base, statuts: statutsFixes({ main: [vert("unit", 901), rouge("unit", 900)] }) });
  assert.deepEqual(cartesEnTodo(journal.base), []);
});
