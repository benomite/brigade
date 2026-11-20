// Un test d'acceptation gelé faux ne fait pas tourner le ticket en boucle (#3799) :
// un cas déjà vert sur la base, que le cook n'a pas le droit de toucher, est
// corrigé ou retiré par la station, et le ticket continue sans le chef. Par la
// station : un vrai dépôt git, un faux GitHub, un faux `claude` qui est le cook
// (il commite les tests gelés, puis le code) ou le relecteur.
import assert from "node:assert/strict";
import { test } from "node:test";
import { A_LA_MAIN } from "../../src/brigade-github.ts";
import { BON_CAS, ENTETE, livre, TICKET } from "./station-du-gel.ts";

const MAUVAIS_CAS = 'test("somme is a function", () => assert.equal(typeof somme, "function"));\n';
const TESTS_GELES = ENTETE + BON_CAS + MAUVAIS_CAS;

test("a frozen acceptance test that already passes on main does not loop the ticket: the wrong case is corrected or dropped, the right one is kept, and the delivery is merged with no gesture from the chef", async (t) => {
  const { faux, ticket, cooks, testsGelesSurLaBranche } = await livre(t, TESTS_GELES, { tours: 5 });
  assert.equal(faux.mergee(TICKET)?.mergeePar, "box", "the ticket goes on to its merge");
  assert.ok(cooks() <= 2, `at most one relaunch of the cook, not a loop: ${cooks()} runs`);
  assert.equal(ticket.labels.has(A_LA_MAIN), false, "nothing goes to the chef");
  const gele = testsGelesSurLaBranche() ?? "";
  assert.equal(gele.includes(MAUVAIS_CAS.trim()), false, "the case that already passes on main is no longer there as written");
  assert.ok(gele.includes(BON_CAS.trim()), "the case that proves the ticket is kept");
});
