// #4230, criterion 2: a kind that is not in the ranking gives 'chef'.
import assert from "node:assert/strict";
import { test } from "node:test";
import { validerReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { rangDe } from "../../src/risque/risque.ts";

test("a kind that is not in the ranking gives 'chef'", () => {
  const fiche = validerReglagesProjet({ integrationBranch: "main", risks: { publish: "safe", "rename-a-file": "safe" } });
  assert.equal(rangDe("rename-a-file", fiche.risks ?? null), "safe");
  assert.equal(rangDe("delete-a-branch", fiche.risks ?? null), "chef");
  assert.equal(rangDe("delete-a-branch", null), "chef");
});
