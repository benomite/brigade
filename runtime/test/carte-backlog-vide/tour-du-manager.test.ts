// La carte du backlog vide servie par le tour du manager (#4225) : le tri du manager écarte
// ce qui n'est pas à cuire — une alerte de la cuisine comme une idée —, et une issue à
// cuire retire la carte de TODO.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

function brigade(t: TestContext, issues: ReturnType<typeof issue>[]) {
  const c = cuisine(t, { manager: {}, issues });
  chef(c.repertoire, "manager.enabled");
  const cartes = () => cartesEnTodo(c.journal.base).filter((carte) => carte.ticket < 0);
  const laisserTourner = async () => {
    const depart = c.gh.sondages.ouvertes;
    await jusqua(() => c.gh.sondages.ouvertes >= depart + 3);
  };
  return { ...c, cartes, laisserTourner };
}

test("an idea and a kitchen alert leave nothing to cook: the manager's loops pose one card, and a cookable issue takes it back", async (t) => {
  const c = brigade(t, [issue(1, ["idea"]), issue(2, ["brigade:breaker-open"])]);
  await jusqua(() => c.cartes().length === 1);
  await c.laisserTourner();
  assert.equal(c.cartes().length, 1);
  assert.match(c.cartes()[0]!.resume, /nothing is left to cook/i);
  assert.equal(c.journal.tout().filter((e) => e.type === "todo.entered" && e.ticket! < 0).length, 1);
  c.gh.poser(issue(3));
  await jusqua(() => c.cartes().length === 0);
});
