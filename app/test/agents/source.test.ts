// Par où l'onglet Agents lit et règle (#4117) : la source passe le projet, l'agent, la clé et la valeur au pont, et rend ce qu'il
// rend — ou rejette avec la phrase du process principal et son détail. Un pont sans le geste (le téléphone) ne lit rien, et ne
// règle pas : jamais un réglage passé pour changé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { source } from "../../src/vue/agents/source.js";

const global = globalThis as unknown as { window?: { brigade: Record<string, unknown> } };

test("the source reads the agents of a project from the bridge", async () => {
  const appels: unknown[][] = [];
  global.window = { brigade: { lireLesAgentsDuProjet: async (...args: unknown[]) => (appels.push(args), [{ agent: "closer" }]) } };
  assert.deepEqual(await source.lire("parade"), [{ agent: "closer" }]);
  assert.deepEqual(appels, [["parade"]]);
});

test("a bridge without the gesture reads nothing, and a reading that fails rejects with its sentence and its detail", async () => {
  global.window = { brigade: {} };
  assert.equal(await source.lire("parade"), null);
  global.window = { brigade: { lireLesAgentsDuProjet: async () => ({ sans: "parade has no station", detail: "ssh refused" }) } };
  await assert.rejects(source.lire("parade"), (erreur: Error & { detail?: string }) => erreur.message === "parade has no station" && erreur.detail === "ssh refused");
  global.window = { brigade: { lireLesAgentsDuProjet: async () => ({}) } };
  await assert.rejects(source.lire("parade"), /its reading gave no answer/);
  global.window = { brigade: { lireLesAgentsDuProjet: async () => Promise.reject(new Error("ipc closed")) } };
  await assert.rejects(source.lire("parade"), /ipc closed/);
});

test("a setting is handed to the bridge with its project, agent, key and value; a refusal rejects with its reason", async () => {
  const appels: unknown[][] = [];
  global.window = { brigade: { reglerUnAgent: async (...args: unknown[]) => (appels.push(args), { ok: true }) } };
  await source.regler("manager", "manager-modele", "opus", "parade");
  assert.deepEqual(appels, [["parade", "manager", "manager-modele", "opus"]]);
  global.window = { brigade: { reglerUnAgent: async () => ({ ok: false, reason: "nothing was changed: the runtime refused it", detail: "empty log" }) } };
  await assert.rejects(source.regler("manager", "manager-modele", "opus", "parade"), (erreur: Error & { detail?: string }) => erreur.message === "nothing was changed: the runtime refused it" && erreur.detail === "empty log");
});

test("a bridge without the gesture does not change a setting", async () => {
  global.window = { brigade: {} };
  await assert.rejects(source.regler("manager", "manager-modele", "opus", "parade"), /the app does not take this gesture on this device/);
  delete global.window;
});
