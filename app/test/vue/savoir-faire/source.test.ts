// Par où le savoir-faire du projet passe (#4241) : la source passe le projet, l'id et le texte au pont, et rend les entrées
// lues ; un refus, un pont sans ces gestes (le téléphone) ou qui rejette lèvent une erreur dont le message est la ligne à
// dire — jamais une liste vide ni un changement réussi.
import assert from "node:assert/strict";
import { test } from "node:test";
import { source } from "../../../src/vue/savoir-faire/source.js";

const global = globalThis as unknown as { window?: { brigade: Record<string, unknown> } };
const ENTREES = [{ id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 }];

test("the source hands the project, the id and the text to the bridge, and returns the entries read", async () => {
  const appels: unknown[][] = [];
  const noter = (nom: string, reponse: unknown) => async (...args: unknown[]) => (appels.push([nom, ...args]), reponse);
  global.window = { brigade: { lireLeSavoirFaire: noter("lire", { entries: ENTREES }), modifierLeSavoirFaire: noter("modifier", { ok: true }), retirerDuSavoirFaire: noter("retirer", { ok: true }) } };
  assert.deepEqual(await source.lire("parade"), ENTREES);
  assert.equal(await source.modifier("L1", "New text.", "parade"), undefined);
  assert.equal(await source.retirer("L1", "parade"), undefined);
  assert.deepEqual(appels, [["lire", "parade"], ["modifier", "parade", "L1", "New text."], ["retirer", "parade", "L1"]]);
  delete global.window;
});

test("a refusal is thrown with its line and its detail", async () => {
  const refus = async () => ({ refus: "know-how unavailable", detail: "$ know-how\nboom" });
  global.window = { brigade: { lireLeSavoirFaire: refus, modifierLeSavoirFaire: refus, retirerDuSavoirFaire: async () => ({ refus: "no detail" }) } };
  await assert.rejects(source.lire("parade"), { message: "know-how unavailable", detail: "$ know-how\nboom" });
  await assert.rejects(source.modifier("L1", "a", "parade"), { message: "know-how unavailable", detail: "$ know-how\nboom" });
  await assert.rejects(source.retirer("L1", "parade"), { message: "no detail", detail: "" });
  delete global.window;
});

test("a bridge without the gestures, or one that rejects, says so on one line", async () => {
  global.window = { brigade: {} };
  for (const appel of [() => source.lire("parade"), () => source.modifier("L1", "a", "parade"), () => source.retirer("L1", "parade")]) {
    await assert.rejects(appel(), { message: "know-how unavailable: this app cannot reach the project's runtime" });
  }
  const rejet = async () => Promise.reject(new Error("ipc closed"));
  global.window = { brigade: { lireLeSavoirFaire: rejet, modifierLeSavoirFaire: rejet, retirerDuSavoirFaire: rejet } };
  for (const appel of [() => source.lire("parade"), () => source.modifier("L1", "a", "parade"), () => source.retirer("L1", "parade")]) {
    await assert.rejects(appel(), { message: "The kitchen not reached.", detail: "Error: ipc closed" });
  }
  delete global.window;
});
