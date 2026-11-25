// The held-gesture check of the supervisor (#4279): a gesture held for the chef and unanswered for more than one hour is an outage.
// The runtime side is built elsewhere: the test double below returns records of its contract.
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifierLesGestesRetenus } from "../../src/held-outage.ts";

type Retenu = { id: number; kind: string; summary: string; reason: string; approveCommand: string; heldAt: string };
const NOW = new Date("2026-11-25T12:00:00.000Z");
const HOUR = 3_600_000;
const il_y_a = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const geste = (id: number, ms: number, summary = `split of the epic #${id}`): Retenu => ({
  id,
  kind: "split",
  summary,
  reason: "waiting for the chef",
  approveCommand: `npm --prefix runtime run manager -- approve ${id}`,
  heldAt: il_y_a(ms),
});
// The double of the runtime: the held gestures it holds right now; the chef approves one, and it leaves the list.
const runtimeDouble = (initial: Retenu[]) => {
  let tenus = [...initial];
  return { held: async () => tenus, approve: (id: number) => void (tenus = tenus.filter((g) => g.id !== id)) };
};
const passe = async (runtime: { held: () => Promise<Retenu[]> }) => String(JSON.stringify(await verifierLesGestesRetenus(runtime, NOW)));

test("a held gesture whose heldAt is more than 1 h ago is reported as an outage with its summary, its age and its approve command", async () => {
  const g = geste(7, 2 * HOUR + 5 * 60_000, "split of the epic #4209");
  const rapport = await passe(runtimeDouble([g]));
  assert.match(rapport, /outage/i);
  assert.ok(rapport.includes(g.summary), rapport);
  assert.match(rapport, /2 ?h|2 hours|125 ?min/, rapport);
  assert.ok(rapport.includes(g.approveCommand.replaceAll('"', '\\"')) || rapport.includes(g.approveCommand), rapport);
});
