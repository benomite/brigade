// La carte du backlog vide branchée sur la porte de TODO (#4225) : elle entre une fois,
// sort quand une issue redevient cuisinable, et son état se relit du journal au démarrage.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { carteBacklogVideDuJournal } from "../../src/carte-backlog-vide/carte-du-journal.ts";
import { brancherLeTriage, cartesEnTodo, cartesRetenues } from "../../src/carte-todo.ts";
import type { GitHub } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repondreALaCarte } from "../../src/reponse-carte.ts";
import { repertoireTemporaire } from "../outils.ts";

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const entrees = () => journal.tout().filter((e) => e.type === "todo.entered").length;
  return { journal, entrees, cartes: () => cartesEnTodo(journal.base), demarrer: () => carteBacklogVideDuJournal(journal, "brigade") };
}
const cuire = { number: 7, labels: ["fire"] };
const sansGitHub = new Proxy({}, { get: () => () => assert.fail("GitHub touched") }) as unknown as GitHub;

test("the card enters TODO once, with no issue of its own, and leaves when an issue is cookable", (t) => {
  const { cartes, demarrer } = cuisine(t);
  const carte = demarrer();
  carte.boucle([]);
  carte.boucle([]);
  assert.equal(cartes().length, 1);
  assert.ok(cartes()[0]!.ticket < 0);
  assert.match(cartes()[0]!.resume, /nothing is left to cook/i);
  carte.boucle([cuire]);
  assert.equal(cartes().length, 0);
  carte.boucle([]);
  assert.equal(cartes().length, 1);
});

test("after a restart, a card still in TODO is not posed a second time", (t) => {
  const { cartes, entrees, demarrer } = cuisine(t);
  demarrer().boucle([]);
  demarrer().boucle([]);
  assert.equal(entrees(), 1);
  assert.equal(cartes().length, 1);
});

test("after a restart with a cookable issue, the card re-armed before is posed again", (t) => {
  const { cartes, entrees, demarrer } = cuisine(t);
  const carte = demarrer();
  carte.boucle([]);
  carte.boucle([cuire]);
  demarrer().boucle([]);
  assert.equal(entrees(), 2);
  assert.equal(cartes().length, 1);
});

test("after the chef answered, a restart in the same empty state poses no new card", async (t) => {
  const { journal, cartes, entrees, demarrer } = cuisine(t);
  demarrer().boucle([]);
  assert.equal((await repondreALaCarte(journal, sansGitHub, "brigade", cartes()[0]!.ticket, { choix: 2 })).done, true);
  assert.equal(cartes().length, 0);
  demarrer().boucle([]);
  assert.equal(entrees(), 1);
  assert.equal(cartes().length, 0);
});

test("a card answered by the chef is re-armed by a cookable issue, and the next empty backlog poses a new one, even after a restart", async (t) => {
  const { journal, cartes, entrees, demarrer } = cuisine(t);
  const carte = demarrer();
  carte.boucle([]);
  const ticket = cartes()[0]!.ticket;
  await repondreALaCarte(journal, sansGitHub, "brigade", ticket, { choix: 1 });
  carte.boucle([cuire]);
  assert.equal(journal.duTicket(ticket).at(-1)?.type, "todo.left");
  demarrer().boucle([]);
  assert.equal(entrees(), 2);
  assert.equal(cartes().length, 1);
});

test("a card held by the triage is not proposed again, even after a restart", (t) => {
  const { journal, cartes, demarrer } = cuisine(t);
  t.after(brancherLeTriage(journal.base, () => true));
  demarrer().boucle([]);
  demarrer().boucle([]);
  assert.equal(cartes().length, 0);
  assert.equal(cartesRetenues(journal.base).length, 1);
  assert.equal(journal.tout().filter((e) => e.type === "todo.held").length, 1);
});
