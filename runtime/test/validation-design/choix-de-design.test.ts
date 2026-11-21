// La règle fixe et la lecture du jugement du modèle (#3609), sur des entrées fixes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSIGNE_MAX } from "../../src/reviewer.ts";
import { consigneDuChoix, estTechnique, lireLeChoix } from "../../src/validation-design/choix-de-design.ts";

const ticket = (title: string, labels: string[] = [], body = "") => ({ title, labels, body });

test("estTechnique: prio:0, a station-opened ticket, or a repair of main is technical; an ordinary ticket is not", () => {
  assert.notEqual(estTechnique(ticket("Tidy", ["prio:0"])), null);
  assert.notEqual(estTechnique(ticket("Tidy", [], "<!-- brigade:supervisor-cause check:tests -->")), null);
  assert.notEqual(estTechnique(ticket("Tidy", [], "x\n_Opened by a station, with no gesture from the chef_")), null);
  assert.notEqual(estTechnique(ticket("Repair `main`, red on 08de823: windows app tests")), null);
  assert.notEqual(estTechnique(ticket("Réparer la base `main`, rouge sur 08de823 : tests")), null);
  assert.equal(estTechnique(ticket("Repair the main menu layout", ["prio:1"])), null);
  assert.equal(estTechnique(ticket("A new rail screen", ["prio:2", "fire"], "## Context")), null);
});

test("lireLeChoix: oui names the choice on one line, non names none", () => {
  assert.deepEqual(lireLeChoix("blah\n<choix-de-design>\noui: a new two-column layout\n</choix-de-design>"), { choix: "a new two-column layout" });
  assert.deepEqual(lireLeChoix("<choix-de-design>non: wording set by the criteria</choix-de-design>"), { choix: null });
});

test("lireLeChoix: no answer, no block, no verdict, or a oui with no line — unreadable", () => {
  for (const message of [null, "", "oui: x", "<choix-de-design>peut-être</choix-de-design>", "<choix-de-design>oui</choix-de-design>", "<choix-de-design>oui: a\nb</choix-de-design>"]) {
    assert.ok("illisible" in lireLeChoix(message), String(message));
  }
});

test("consigneDuChoix carries the ticket's criteria, the files and the diff", () => {
  const texte = consigneDuChoix({ ticket: { number: 7, title: "T", body: "- the criterion" }, fichiers: ["app/src/vue/a.js"], diff: "+x" });
  for (const attendu of ["- the criterion", "- app/src/vue/a.js", "+x", "<choix-de-design>"]) assert.ok(texte.includes(attendu), attendu);
  assert.ok(!texte.includes("[coupé]"));
});

// #3785 : le diff entier de #3734 faisait échouer le lancement en `E2BIG`, 49 fois de suite.
test("consigneDuChoix fits in one command argument whatever the size of the diff, the body and the files, and says what it cut", () => {
  const texte = consigneDuChoix({
    ticket: { number: 3734, title: "T", body: "é".repeat(40_000) },
    fichiers: Array.from({ length: 2_000 }, (_, rang) => `app/src/vue/fichier-${rang}.js`),
    diff: "+ligne\n".repeat(60_000),
  });
  assert.ok(Buffer.byteLength(texte) < CONSIGNE_MAX, `${Buffer.byteLength(texte)} bytes`);
  assert.ok(texte.includes("Le diff est trop long pour tenir ici"));
  assert.equal(texte.split("[coupé]").length - 1, 3);
});
