// #3953, critère 3 : un `main` rouge qu'une relance ou un ticket de réparation peut encore réparer ne crée aucune
// carte TODO.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { evaluerMain } from "../../src/statuts-ci/regles.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

type R = { check: string; outcome: "red" | "green"; run: number };
const rouge = (check: string, run: number): R => ({ check, outcome: "red", run });
const statutsFixes = (parCible: Record<string, R[]>) => ({ resultats: async (cible: string) => parCible[cible] ?? [] });

test("a red main the kitchen can still fix creates no TODO card", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  const statuts = statutsFixes({ main: [rouge("unit", 900)] });
  await evaluerMain({ statuts, journal, projet: "brigade", cuisinePeutReparer: async () => true });
  assert.deepEqual(cartesEnTodo(journal.base), []);
});
