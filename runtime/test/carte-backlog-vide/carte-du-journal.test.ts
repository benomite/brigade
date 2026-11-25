// La carte du backlog vide branchée sur la porte de TODO (#4225) : elle entre une fois,
// sort quand une issue redevient cuisinable, et son état se relit du journal au démarrage.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { carteBacklogVideDuJournal, carteDejaPosee, TEXTE_BACKLOG_VIDE, TICKET_BACKLOG_VIDE } from "../../src/carte-backlog-vide/carte-backlog-vide.ts";
import { brancherLeTriage, cartesEnTodo, cartesRetenues } from "../../src/carte-todo.ts";
import type { GitHub } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repondreALaCarte } from "../../src/reponse-carte.ts";
import { repertoireTemporaire } from "../outils.ts";

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  return { journal, cartes: () => cartesEnTodo(journal.base).filter((carte) => carte.ticket === TICKET_BACKLOG_VIDE) };
}
const cuire = { number: 7, labels: ["fire"] };

test("the card enters TODO once, with the text of the empty backlog, and leaves when an issue is cookable", (t) => {
  const { journal, cartes } = cuisine(t);
  const carte = carteBacklogVideDuJournal(journal, "brigade");
  carte.boucle([]);
  carte.boucle([]);
  assert.equal(cartes().length, 1);
  assert.equal(cartes()[0]!.resume, TEXTE_BACKLOG_VIDE);
  assert.equal(carteDejaPosee(journal), true);
  carte.boucle([cuire]);
  assert.equal(cartes().length, 0);
  assert.equal(carteDejaPosee(journal), false);
  carte.boucle([]);
  assert.equal(cartes().length, 1);
});

test("a fresh journal has no card yet", (t) => {
  const { journal } = cuisine(t);
  assert.equal(carteDejaPosee(journal), false);
});

test("after a restart, a card still in TODO is not posed a second time", (t) => {
  const { journal, cartes } = cuisine(t);
  carteBacklogVideDuJournal(journal, "brigade").boucle([]);
  carteBacklogVideDuJournal(journal, "brigade").boucle([]);
  assert.equal(journal.base.lire("SELECT 1 FROM events WHERE type = 'todo.entered'").length, 1);
  assert.equal(cartes().length, 1);
});

test("after the chef answered, a restart in the same empty state poses no new card", async (t) => {
  const { journal, cartes } = cuisine(t);
  carteBacklogVideDuJournal(journal, "brigade").boucle([]);
  const sansGitHub = new Proxy({}, { get: () => () => assert.fail("GitHub touched") }) as unknown as GitHub;
  assert.equal((await repondreALaCarte(journal, sansGitHub, "brigade", TICKET_BACKLOG_VIDE, { choix: 2 })).done, true);
  assert.equal(cartes().length, 0);
  assert.equal(carteDejaPosee(journal), true);
  carteBacklogVideDuJournal(journal, "brigade").boucle([]);
  assert.equal(cartes().length, 0);
});

test("a card answered by the chef is re-armed by a cookable issue, and the next empty backlog poses a new one", async (t) => {
  const { journal, cartes } = cuisine(t);
  const carte = carteBacklogVideDuJournal(journal, "brigade");
  carte.boucle([]);
  const sansGitHub = new Proxy({}, { get: () => () => assert.fail("GitHub touched") }) as unknown as GitHub;
  await repondreALaCarte(journal, sansGitHub, "brigade", TICKET_BACKLOG_VIDE, { choix: 1 });
  carte.boucle([cuire]);
  assert.equal(journal.duTicket(TICKET_BACKLOG_VIDE).at(-1)?.type, "todo.left");
  assert.equal(carteDejaPosee(journal), false);
  carteBacklogVideDuJournal(journal, "brigade").boucle([]);
  assert.equal(cartes().length, 1);
});

test("a card held by the triage is not proposed again at each loop", (t) => {
  const { journal, cartes } = cuisine(t);
  t.after(brancherLeTriage(journal.base, () => true));
  carteBacklogVideDuJournal(journal, "brigade").boucle([]);
  carteBacklogVideDuJournal(journal, "brigade").boucle([]);
  const carte = carteBacklogVideDuJournal(journal, "brigade");
  carte.boucle([]);
  assert.equal(cartes().length, 0);
  assert.equal(cartesRetenues(journal.base).filter((c) => c.ticket === TICKET_BACKLOG_VIDE).length, 1);
  assert.equal(journal.base.lire("SELECT 1 FROM events WHERE type = 'todo.held'").length, 1);
});
