// #3895, critère 4 : un manager qui nomme une cause hors du code ne dit jamais aux cooks d'ignorer le rouge ; la cuisine la répare ou une carte la nomme au chef.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const manager = readFileSync(new URL("../../../commands/manager.md", import.meta.url), "utf8");

test("the manager's role forbids telling cooks to ignore a red check whose cause is out of the code, and has it fixed or carded to the chef", () => {
  const regles = manager.split("\n").filter((l) => /(secret|label manquant|réglage de (la )?CI|hors du code)/i.test(l));
  assert.ok(regles.length > 0, "a rule names causes out of the cook's reach (missing label, CI setting, secret)");
  const regle = regles.join("\n");
  assert.match(regle, /ignor/i, "it forbids telling cooks to ignore the red");
  assert.match(regle, /jamais|ne \S+ pas|never/i);
  assert.match(regle, /carte|ticket/i, "it either files a ticket on the CI or a card to the chef");
  assert.match(regle, /chef/i);
});
