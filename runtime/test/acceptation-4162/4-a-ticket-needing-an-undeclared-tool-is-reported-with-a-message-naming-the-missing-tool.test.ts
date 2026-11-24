// #4162, critère 4 : un ticket qui demande un outil non déclaré est signalé, par un message qui nomme l'outil manquant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { outilsDuCook } from "../../src/outils-du-cook.ts";

test("a ticket needing an undeclared tool is reported with a message naming it, not run silently without it", () => {
  const resultat = outilsDuCook({ projet: { tools: ["browser"] }, corpsDuTicket: "## Context\n\nx\n\nTools: screenshots\n" });
  assert.deepEqual(resultat.manquants, ["screenshots"]);
  assert.ok(!resultat.outils.includes("screenshots"));
  assert.match(String(resultat.message), /screenshots/);
});
