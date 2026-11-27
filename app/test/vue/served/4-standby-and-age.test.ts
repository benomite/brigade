// #3925 : la veille du rail se relit toutes les 5 s (et non 30 s), une lecture ne reste fraîche que 4 s. Tests de ce
// delivery, en plus des tests d'acceptation gelés.
import assert from "node:assert/strict";
import { test } from "node:test";
import { openStandbyOfBoard, holdReadsOfBoard } from "../../../src/board/rail.ts";
import { FRESHNESS_MAX_OF_A_READ_MS, INTERVAL_OF_THE_STANDBY_MS } from "../../../src/vue/served/freshness.ts";

const REPOSITORY = "acme/kitchen";
const T0 = Date.parse("2026-11-20T10:00:00Z");

test("the rail watch waits 5 s between two readings by default", async () => {
  assert.equal(INTERVAL_OF_THE_STANDBY_MS, 5_000);
  const waits: number[] = [];
  let readings = 0;
  let rereadOne!: () => void;
  const twoReads = new Promise<void>((end) => (rereadOne = end));
  const standby = openStandbyOfBoard<{ nom: string }>({
    lire: async () => ({ lu: false, depot: REPOSITORY, luLe: new Date(T0).toISOString(), raison: "x" }),
    attendre: (async (ms: number) => void waits.push(ms)) as unknown as typeof import("node:timers/promises").setTimeout,
    surLecture: () => {
      if (++readings === 2) rereadOne();
    },
  });
  standby.regarder([{ nom: "parade" }], [], 1);
  await twoReads;
  standby.fermer();
  assert.deepEqual(waits.slice(0, 2), [5_000, 5_000]);
});

test("a rail reading never stays fresh as long as a watch turn, whatever freshness is asked", async () => {
  let instant = 0;
  let calls = 0;
  const readings = holdReadsOfBoard<{ nom: string }>({
    lire: async () => (calls++, { lu: false, depot: REPOSITORY, luLe: new Date(T0).toISOString(), raison: "x" }),
    fraicheurMs: 60_000,
    maintenant: () => instant,
  });
  await readings.lire({ nom: "p" });
  instant = FRESHNESS_MAX_OF_A_READ_MS - 1;
  await readings.lire({ nom: "p" });
  assert.equal(calls, 1);
  instant = FRESHNESS_MAX_OF_A_READ_MS;
  await readings.lire({ nom: "p" });
  assert.equal(calls, 2);
  assert.ok(FRESHNESS_MAX_OF_A_READ_MS < INTERVAL_OF_THE_STANDBY_MS);
});
