// #4220, critère 4 : l état d un agent — working avec son ticket, broken après un échec sans reprise, idle sinon.
// Contrat supposé par les tests d acceptation de #4220 (le cook le réalise, sans le changer) :
//   runtime/src/agents-tab/registre.ts  exporte REGISTRE : { id, name, role }[]
//   runtime/src/agents-tab/api.ts       exporte repondre({ method, url }, sources) -> { statut, corps }
//   sources (tous les champs sont facultatifs sauf maintenant) : { maintenant: Date, repertoireDesGestes?: string,
//     enCours?: { id, ticket: number | null }[], enEchec?: string[] /* id dont le dernier run a échoué sans reprise */ }
import assert from "node:assert/strict";
import { test } from "node:test";
import { repondre } from "../../src/agents-tab/api.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
type Entree = { id: string; state: string; workingOn: number | null };
const manager = (sources: Record<string, unknown>) =>
  (repondre({ method: "GET", url: "/api/agents" }, { maintenant: MAINTENANT, ...sources }).corps as Entree[]).find((a) => a.id === "manager") as Entree;

test("an agent running a ticket is working, with its issue number", () => {
  const a = manager({ enCours: [{ id: "manager", ticket: 4220 }] });
  assert.equal(a.state, "working");
  assert.equal(a.workingOn, 4220);
});

test("an agent whose last run failed and is not retried is broken", () => {
  const a = manager({ enEchec: ["manager"] });
  assert.equal(a.state, "broken");
  assert.equal(a.workingOn, null);
});

test("an agent with nothing running and no failure is idle", () => {
  const a = manager({});
  assert.equal(a.state, "idle");
  assert.equal(a.workingOn, null);
});
