// Un ticket dont le test d'acceptance gelé faux ne laisse rien à garder ne peut pas
// continuer (#3799) : il est mis de côté une fois, la raison en une ligne, et la
// cuisine ne le relance plus. Par la station : un vrai dépôt git, un faux GitHub,
// un faux `claude` qui est le cook ou le relecteur.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ENTETE, livre, TICKET } from "./station-du-gel.ts";

const MAUVAIS_CAS = 'test("somme is a function", () => assert.equal(typeof somme, "function"));\n';
const AUTRE_MAUVAIS_CAS = 'test("somme is exported", () => assert.ok("somme" in { somme }));\n';
const TESTS_GELES = ENTETE + MAUVAIS_CAS + AUTRE_MAUVAIS_CAS;

const MISE_DE_COTE = /^(?:set-aside:.*|served-elsewhere)$/;

test("a ticket that cannot go on once its wrong frozen tests are dropped is set aside once, with the reason in one line, and is not relaunched again", async (t) => {
  const { faux, ticket, cooks, commentaires } = await livre(t, TESTS_GELES, { tours: 6 });
  assert.ok([...ticket.labels].some((label) => MISE_DE_COTE.test(label)), `set aside: ${[...ticket.labels].join(", ")}`);
  assert.equal(faux.mergee(TICKET), undefined);
  const lances = cooks();
  assert.ok(lances <= 2, `no more than one relaunch before it is set aside: ${lances} runs`);
  const mises = commentaires.filter((corps) => /set aside/i.test(corps));
  assert.equal(mises.length, 1, "it is set aside once");
  const raison = (mises[0] ?? "").split("\n").find((ligne) => /already passes on `main`/.test(ligne));
  assert.ok(raison?.includes("somme is a function"), "one line gives the reason and names the test");
  // Les tours qui suivent (six en tout) ne l'ont ni relancé ni remis de côté.
});
