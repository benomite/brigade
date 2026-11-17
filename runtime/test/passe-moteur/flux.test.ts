import assert from "node:assert/strict";
import { test } from "node:test";
import { lireFlux } from "../../src/claude.ts";
import { enFluxClaude } from "../../src/passe-moteur/flux.ts";

const codex = (...evenements: unknown[]) => evenements.map((e) => JSON.stringify(e)).join("\n");
const message = { type: "item.completed", item: { type: "agent_message", text: "done" } };

test("a codex stream that ends its turn is read as a delivered cook, with its last message", () => {
  const lu = lireFlux(enFluxClaude(codex({ type: "turn.started" }, message, { type: "turn.completed" })));
  assert.deepEqual(lu.resultat, { erreur: false });
  assert.equal(lu.message, "done");
});

test("a codex stream whose turn failed, or never ended, is not a delivered cook", () => {
  assert.deepEqual(lireFlux(enFluxClaude(codex(message, { type: "turn.failed" }))).resultat, { erreur: true });
  assert.equal(lireFlux(enFluxClaude(codex(message))).resultat, null);
});

test("a claude stream is read as it is", () => {
  const flux = `${JSON.stringify({ type: "result", is_error: false, result: "ok" })}\n`;
  assert.equal(enFluxClaude(flux), flux);
  assert.equal(enFluxClaude(""), "");
});
