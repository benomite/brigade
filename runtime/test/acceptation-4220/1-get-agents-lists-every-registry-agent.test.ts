// #4220, critère 1 : GET /api/agents rend une entrée par agent du registre, avec les champs du contrat.
// Contrat supposé par les tests d acceptation de #4220 (le cook le réalise, sans le changer) :
//   runtime/src/agents-tab/registre.ts  exporte REGISTRE : { id, name, role }[]
//   runtime/src/agents-tab/api.ts       exporte repondre({ method, url }, sources) -> { statut, corps }
//   sources (tous les champs sont facultatifs sauf maintenant) : { maintenant: Date, repertoireDesGestes?: string,
//     enCours?: { id, ticket: number | null }[], enEchec?: string[] /* id dont le dernier run a échoué sans reprise */ }
import assert from "node:assert/strict";
import { test } from "node:test";
import { repondre } from "../../src/agents-tab/api.ts";
import { REGISTRE } from "../../src/agents-tab/registre.ts";

test("GET /api/agents returns one entry per registry agent with the contract fields", () => {
  const { statut, corps } = repondre({ method: "GET", url: "/api/agents" }, { maintenant: new Date("2026-11-25T12:00:00.000Z") });
  assert.equal(statut, 200);
  const liste = corps as Record<string, unknown>[];
  assert.ok(REGISTRE.length >= 6);
  assert.deepEqual(liste.map((a) => a.id), REGISTRE.map((a) => a.id));
  for (const [i, agent] of liste.entries()) {
    assert.equal(agent.name, REGISTRE[i]?.name);
    assert.ok(typeof agent.role === "string" && agent.role.length > 0);
    assert.ok(["idle", "working", "broken"].includes(agent.state as string));
    assert.ok(agent.workingOn === null || Number.isInteger(agent.workingOn));
    assert.ok(agent.nextRun === null || (typeof agent.nextRun === "string" && !Number.isNaN(Date.parse(agent.nextRun))));
    assert.ok(Array.isArray(agent.figures));
    assert.ok("settings" in agent && agent.settings === null);
  }
});
