// La correction d'un test d'acceptance gelé faux se voit sur l'issue (#3799) : quel
// test, pourquoi il était faux, ce qui en a été fait. Par la station : un vrai
// dépôt git, un faux GitHub, un faux `claude` qui est le cook ou le relecteur.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BON_CAS, ENTETE, GELE, livre } from "./station-du-gel.ts";

const MAUVAIS_CAS = 'test("somme is a function", () => assert.equal(typeof somme, "function"));\n';
const TESTS_GELES = ENTETE + BON_CAS + MAUVAIS_CAS;

test("the correction of a wrong frozen test is on the issue: which test, why it was wrong (it already passes on main), and what was done to it", async (t) => {
  const { commentaires } = await livre(t, TESTS_GELES, { tours: 5 });
  const dite = commentaires.filter((corps) => !corps.startsWith("<!-- brigade:renvoi")).find((corps) => corps.includes("somme is a function"));
  assert.ok(dite !== undefined, `no comment but the send-backs names the wrong test:\n${commentaires.join("\n---\n")}`);
  assert.ok(dite.includes(GELE), "it names the frozen test file");
  assert.match(dite, /already passes on `main`/, "it says why the test was wrong");
  assert.match(dite, /\b(?:corrected|dropped|removed|amended|replaced)\b/i, "it says what was done");
  assert.equal(dite.includes("adds two numbers"), false, "it does not blame the case that was right");
});
