// Test d'acceptation gelé (#4081). Critère 2 : l'action qui déclenche l'avis de macOS ne tourne pas avant que le
// nouvel arrivant appuie sur le bouton.
// Contrat : app/src/first-launch/index.ts exporte `passerLePremierLancement({ marque, afficher, declencher })` —
// `marque` est un chemin de fichier, `afficher` rend une promesse résolue quand le bouton est pressé, `declencher` est
// l'action qui fait venir l'avis de macOS (l'inscription de l'élément de session).
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { passTheFirstLaunch } from "../../src/first-launch/index.ts";

test("the macOS-notice action does not run until the button is pressed", async () => {
  const brand = join(mkdtempSync(join(tmpdir(), "premier-")), "vu");
  const calls: string[] = [];
  let press: () => void = () => undefined;
  const wait = new Promise<void>((resolved) => (press = resolved));
  const finished = passTheFirstLaunch({
    marque: brand,
    afficher: async () => {
      calls.push("afficher");
      await wait;
      calls.push("bouton");
    },
    declencher: async () => void calls.push("declencher"),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls, ["afficher"], "the action ran before the button was pressed");
  press();
  await finished;
  assert.deepEqual(calls, ["afficher", "bouton", "declencher"]);
});
