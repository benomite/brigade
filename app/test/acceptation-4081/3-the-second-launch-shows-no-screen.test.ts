// Test d'acceptation gelé (#4081). Critère 3 : au second lancement, l'écran n'apparaît pas (et l'action tourne sans attendre).
// Contrat : voir 2-the-notice-action-waits-for-the-button.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { passerLePremierLancement } from "../../src/premier-lancement/index.ts";

test("after the first launch was confirmed, the second launch does not show the screen", async () => {
  const marque = join(mkdtempSync(join(tmpdir(), "premier-")), "vu");
  let ecrans = 0;
  let actions = 0;
  const lancement = () =>
    passerLePremierLancement({ marque, afficher: async () => void ecrans++, declencher: async () => void actions++ });
  await lancement();
  assert.equal(ecrans, 1, "first launch shows the screen");
  await lancement();
  assert.equal(ecrans, 1, "second launch shows no screen");
  assert.equal(actions, 2);
});
