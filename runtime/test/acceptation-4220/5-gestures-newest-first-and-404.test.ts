// #4220, critère 5 : GET /api/agents/:id/gestures — les derniers gestes, le plus récent d abord ; id inconnu : 404.
// Source : le fil de #4029 (autonomie/agents/gestes.ts).
// Contrat supposé par les tests d acceptation de #4220 (le cook le réalise, sans le changer) :
//   runtime/src/agents-tab/registre.ts  exporte REGISTRE : { id, name, role }[]
//   runtime/src/agents-tab/api.ts       exporte repondre({ method, url }, sources) -> { statut, corps }
//   sources (tous les champs sont facultatifs sauf maintenant) : { maintenant: Date, repertoireDesGestes?: string,
//     enCours?: { id, ticket: number | null }[], enEchec?: string[] /* id dont le dernier run a échoué sans reprise */ }
import assert from "node:assert/strict";
import { test } from "node:test";
import { repondre } from "../../src/agents-tab/api.ts";
import { consignerGeste, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { repertoireTemporaire } from "../outils.ts";

const A = (h: number) => () => new Date(`2026-11-24T${String(h).padStart(2, "0")}:00:00.000Z`);

test("the gestures of an agent come newest first, with at, summary, reason and issue", (t) => {
  const dossier = repertoireTemporaire(t);
  consignerGeste(dossier, "closer", { line: "opened a cleanup PR", reason: "its nightly pass", outcome: OUTCOME.FIXED_BY_SELF }, A(9));
  consignerGeste(dossier, "closer", { line: "stopped at the token cap", reason: "cap reached", outcome: OUTCOME.HANDED_TO_CHEF }, A(11));
  const { statut, corps } = repondre({ method: "GET", url: "/api/agents/closer/gestures" }, { maintenant: A(12)(), repertoireDesGestes: dossier });
  assert.equal(statut, 200);
  const gestes = corps as { at: string; summary: string; reason: string; issue: number | null }[];
  assert.deepEqual(gestes.map((g) => g.summary), ["stopped at the token cap", "opened a cleanup PR"]);
  assert.deepEqual(gestes.map((g) => g.at), [A(11)().toISOString(), A(9)().toISOString()]);
  assert.deepEqual(gestes.map((g) => g.reason), ["cap reached", "its nightly pass"]);
  for (const g of gestes) assert.ok("issue" in g && (g.issue === null || Number.isInteger(g.issue)));
});

test("an unknown agent id answers 404", (t) => {
  const dossier = repertoireTemporaire(t);
  const { statut } = repondre({ method: "GET", url: "/api/agents/nobody/gestures" }, { maintenant: A(12)(), repertoireDesGestes: dossier });
  assert.equal(statut, 404);
});
