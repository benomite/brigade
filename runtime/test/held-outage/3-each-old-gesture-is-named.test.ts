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

test("with three old held gestures, each one is named with its summary and its approve command", async () => {
  const gestes = [geste(1, 2 * HOUR, "first held thing"), geste(2, 3 * HOUR, "second held thing"), geste(3, 5 * HOUR, "third held thing")];
  const rapport = await passe(runtimeDouble(gestes));
  for (const g of gestes) {
    assert.ok(rapport.includes(g.summary), `${g.summary} is not named: ${rapport}`);
    assert.ok(rapport.includes(g.approveCommand), `${g.approveCommand} is not named: ${rapport}`);
  }
});
