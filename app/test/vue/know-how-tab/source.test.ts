// Par où le savoir-faire du projet passe (#4241) : la source passe le projet, l'id et le texte au pont, et rend les entrées
// lues ; un refus, un pont sans ces gestes (le téléphone) ou qui rejette lèvent une erreur dont le message est la ligne à
// dire — jamais une liste vide ni un changement réussi.
import assert from "node:assert/strict";
import { test } from "node:test";
import { source } from "../../../src/vue/know-how-tab/source.js";

const global = globalThis as unknown as { window?: { brigade: Record<string, unknown> } };
const ENTRIES = [{ id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 }];

test("the source hands the project, the id and the text to the bridge, and returns the entries read", async () => {
  const calls: unknown[][] = [];
  const note = (name: string, answer: unknown) => async (...args: unknown[]) => (calls.push([name, ...args]), answer);
  global.window = { brigade: { lireLeSavoirFaire: note("lire", { entries: ENTRIES }), modifierLeSavoirFaire: note("modifier", { ok: true }), retirerDuSavoirFaire: note("retirer", { ok: true }) } };
  assert.deepEqual(await source.lire("parade"), ENTRIES);
  assert.equal(await source.modifier("L1", "New text.", "parade"), undefined);
  assert.equal(await source.retirer("L1", "parade"), undefined);
  assert.deepEqual(calls, [["lire", "parade"], ["modifier", "parade", "L1", "New text."], ["retirer", "parade", "L1"]]);
  delete global.window;
});

test("a refusal is thrown with its line and its detail", async () => {
  const refusal = async () => ({ refus: "know-how unavailable", detail: "$ know-how\nboom" });
  global.window = { brigade: { lireLeSavoirFaire: refusal, modifierLeSavoirFaire: refusal, retirerDuSavoirFaire: async () => ({ refus: "no detail" }) } };
  await assert.rejects(source.lire("parade"), { message: "know-how unavailable", detail: "$ know-how\nboom" });
  await assert.rejects(source.modifier("L1", "a", "parade"), { message: "know-how unavailable", detail: "$ know-how\nboom" });
  await assert.rejects(source.retirer("L1", "parade"), { message: "no detail", detail: "" });
  delete global.window;
});

test("a bridge without the gestures, or one that rejects, says so on one line", async () => {
  global.window = { brigade: {} };
  for (const call of [() => source.lire("parade"), () => source.modifier("L1", "a", "parade"), () => source.retirer("L1", "parade")]) {
    await assert.rejects(call(), { message: "the know-how cannot be read here: this app does not carry it" });
  }
  const rejection = async () => Promise.reject(new Error("ipc closed"));
  global.window = { brigade: { lireLeSavoirFaire: rejection, modifierLeSavoirFaire: rejection, retirerDuSavoirFaire: rejection } };
  for (const call of [() => source.lire("parade"), () => source.modifier("L1", "a", "parade"), () => source.retirer("L1", "parade")]) {
    await assert.rejects(call(), { message: "The kitchen not reached.", detail: "Error: ipc closed" });
  }
  delete global.window;
});
