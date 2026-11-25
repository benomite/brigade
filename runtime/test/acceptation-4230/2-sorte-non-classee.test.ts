// #4230, criterion 2: a kind that is not in the ranking gives 'chef'.
import assert from "node:assert/strict";
import { test } from "node:test";
import { validerReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { risqueDuTicket } from "../../src/risque/risque.ts";

test("a kind that is not in the ranking gives 'chef'", () => {
  const fiche = validerReglagesProjet({ integrationBranch: "main", risks: { publish: "safe", "rename-a-file": "safe" } });
  const rang = (sorte: string) => risqueDuTicket([`kind:${sorte}`], () => fiche.risks ?? null)?.rang;
  assert.equal(rang("rename-a-file"), "safe");
  assert.equal(rang("delete-a-branch"), "chef");
  assert.equal(risqueDuTicket(["kind:delete-a-branch"], () => null)?.rang, "chef");
});
