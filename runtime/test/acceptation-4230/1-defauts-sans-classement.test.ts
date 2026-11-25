// #4230, criterion 1: a project sheet with no ranking gives 'chef' for publish, pay and write to a client.
import assert from "node:assert/strict";
import { test } from "node:test";
import { validerReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { rangDe } from "../../src/risque/risque.ts";

test("a project sheet with no ranking gives 'chef' for publish, pay and write to a client", () => {
  const fiche = validerReglagesProjet({ integrationBranch: "main" });
  assert.equal(fiche.risks, undefined);
  for (const sorte of ["publish", "pay", "write-to-client"]) assert.equal(rangDe(sorte, fiche.risks ?? null), "chef", sorte);
});
