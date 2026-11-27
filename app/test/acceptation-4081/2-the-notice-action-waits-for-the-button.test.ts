// Test d'acceptation gelé (#4081). Critère 2 : l'action qui déclenche l'avis de macOS ne tourne pas avant que le
// nouvel arrivant appuie sur le bouton.
// Contrat : app/src/premier-lancement/index.ts exporte `passerLePremierLancement({ marque, afficher, declencher })` —
// `marque` est un chemin de fichier, `afficher` rend une promesse résolue quand le bouton est pressé, `declencher` est
// l'action qui fait venir l'avis de macOS (l'inscription de l'élément de session).
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { passerLePremierLancement } from "../../src/premier-lancement/index.ts";

test("the macOS-notice action does not run until the button is pressed", async () => {
  const marque = join(mkdtempSync(join(tmpdir(), "premier-")), "vu");
  const appels: string[] = [];
  let presser: () => void = () => undefined;
  const attente = new Promise<void>((resolu) => (presser = resolu));
  const fini = passerLePremierLancement({
    marque,
    afficher: async () => {
      appels.push("afficher");
      await attente;
      appels.push("bouton");
    },
    declencher: async () => void appels.push("declencher"),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(appels, ["afficher"], "the action ran before the button was pressed");
  presser();
  await fini;
  assert.deepEqual(appels, ["afficher", "bouton", "declencher"]);
});
