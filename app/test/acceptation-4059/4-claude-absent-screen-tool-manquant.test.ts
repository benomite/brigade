// Test d'acceptation gelé (#4059), critère 4. Le contrat que ce test fixe : quand le binaire `claude` manque, `tenirLogin`
// (app/src/outages/login.ts) ne rend plus de `refus` « could not be started on this computer » ; il rend `{ outilManquant: "claude" }`,
// et la vue montre alors l'écran de l'outil manquant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdLogin } from "../../src/outages/login.ts";

test("a missing claude no longer says 'Claude Code could not be started on this computer': the missing-tool screen shows instead", async () => {
  const rendu = (await holdLogin({ claude: "/nulle/part/claude-absent", env: {}, dire: () => {} })()) as Record<string, unknown>;
  assert.doesNotMatch(JSON.stringify(rendu), /could not be started on this computer/);
  assert.equal(rendu.outilManquant, "claude");
});
