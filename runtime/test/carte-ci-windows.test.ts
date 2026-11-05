// La carte d'un check Windows rouge sur main : une seule, par check et par branche (#2413).
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { brancherLeTriage, cartesEnTodo, cartesRetenues } from "../src/carte-todo.ts";
import { suivreLesChecksWindows, ticketDuCheck, type CheckVu } from "../src/carte-ci-windows.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { repertoireTemporaire } from "./outils.ts";

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const suivre = (...checks: CheckVu[]) => suivreLesChecksWindows(journal, "brigade", "main", checks);
  return { journal, suivre, cartes: () => cartesEnTodo(journal.base) };
}
const rouge = (name: string): CheckVu => ({ name, outcome: "red" });
const vert = (name: string): CheckVu => ({ name, outcome: "green" });

test("deux runs rouges du même check sur main, sur deux commits, font une seule carte", (t) => {
  const { suivre, cartes } = cuisine(t);
  assert.deepEqual(suivre(rouge("runtime-windows")).entrees, ["runtime-windows"]);
  assert.deepEqual(suivre(rouge("runtime-windows")).entrees, []);
  assert.equal(cartes().length, 1);
  assert.equal(cartes()[0]!.ticket, ticketDuCheck("runtime-windows", "main"));
});

test("runtime-windows et app-windows rouges ont chacun leur carte, une seule", (t) => {
  const { suivre, cartes } = cuisine(t);
  suivre(rouge("runtime-windows"), rouge("app-windows"));
  suivre(rouge("runtime-windows"), rouge("app-windows"));
  assert.equal(cartes().length, 2);
  assert.notEqual(ticketDuCheck("runtime-windows", "main"), ticketDuCheck("app-windows", "main"));
});

test("la carte sort de TODO quand le check redevient vert, et revient s'il reperd", (t) => {
  const { suivre, cartes } = cuisine(t);
  suivre(rouge("runtime-windows"), rouge("app-windows"));
  assert.deepEqual(suivre(vert("runtime-windows"), rouge("app-windows")).sorties, ["runtime-windows"]);
  assert.deepEqual(cartes().map((c) => c.ticket), [ticketDuCheck("app-windows", "main")]);
  suivre(rouge("runtime-windows"));
  assert.equal(cartes().length, 2);
});

test("un check en cours ou étranger ne touche à aucune carte", (t) => {
  const { suivre, cartes } = cuisine(t);
  suivre(rouge("runtime-windows"), rouge("lint"));
  suivre({ name: "runtime-windows", outcome: "pending" });
  assert.equal(cartes().length, 1);
});

test("une carte que le triage retient n'est pas reproposée à chaque run rouge", (t) => {
  const { journal, suivre, cartes } = cuisine(t);
  t.after(brancherLeTriage(journal.base, () => true));
  suivre(rouge("runtime-windows"));
  suivre(rouge("runtime-windows"));
  assert.equal(cartes().length, 0);
  assert.equal(cartesRetenues(journal.base).length, 1);
  assert.equal(journal.base.lire("SELECT 1 FROM events WHERE type = 'todo.held'").length, 1);
});
