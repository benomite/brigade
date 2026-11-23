// Par où le mot au cook part (#4048) : la source passe `{ticket, text}` et le projet au pont, et rend sa réponse ; un pont
// sans le geste (le téléphone), ou qui rejette, se dit en une ligne — jamais un envoi réussi.
import assert from "node:assert/strict";
import { test } from "node:test";
import { source } from "../../src/vue/mot-au-cook/source.js";

const global = globalThis as unknown as { window?: { brigade: Record<string, unknown> } };

test("the source hands {ticket, text} and the project to the bridge, and returns its answer", async () => {
  const appels: unknown[][] = [];
  global.window = { brigade: { envoyerUnMot: async (...args: unknown[]) => (appels.push(args), { ok: false, reason: "no cook" }) } };
  assert.deepEqual(await source.envoyer({ ticket: 14, text: "hi" }, "parade"), { ok: false, reason: "no cook" });
  assert.deepEqual(appels, [["parade", { ticket: 14, text: "hi" }]]);
});

test("a bridge without the gesture, or one that rejects, says so on one line", async () => {
  global.window = { brigade: {} };
  assert.deepEqual(await source.envoyer({ ticket: 14, text: "hi" }, "parade"), { ok: false, reason: "nothing was sent: this app cannot pass a word to a cook" });
  global.window = { brigade: { envoyerUnMot: async () => Promise.reject(new Error("ipc closed")) } };
  assert.deepEqual(await source.envoyer({ ticket: 14, text: "hi" }, "parade"), { ok: false, reason: "The kitchen not reached. The word was not sent.", detail: "Error: ipc closed" });
  delete global.window;
});
