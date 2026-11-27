// #3925 : la veille du rail se relit toutes les 5 s (et non 30 s), une lecture ne reste fraîche que 4 s, et l'âge d'un merge
// se dit au mot près. Tests de ce delivery, en plus des tests d'acceptation gelés.
import assert from "node:assert/strict";
import { test } from "node:test";
import { understand, duration, board as boardOf, type Facts, type Board } from "../../../src/facts.ts";
import type { ReadOfBoardOfRepository } from "../../../src/board/read.ts";
import { readTheBoardOfRepository } from "../../../src/board/read.ts";
import { openStandbyOfBoard, statusOfBoard, holdReadsOfBoard } from "../../../src/board/rail.ts";
import { FRESHNESS_MAX_OF_A_READ_MS, INTERVAL_OF_THE_STANDBY_MS } from "../../../src/vue/served/freshness.ts";

const REPOSITORY = "acme/kitchen";
const T0 = Date.parse("2026-11-20T10:00:00Z");
const ok = (data: unknown) => ({ status: 200, data });

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

const closedOne = (n: number, mergeThe: string) => ({
  number: 1000 + n, title: `#${n} — Ticket ${n}`, html_url: `https://github.com/${REPOSITORY}/pull/${1000 + n}`, created_at: "2026-11-20T09:00:00Z",
  updated_at: mergeThe, merged_at: mergeThe, head: { ref: `cook/${n}-github` }, body: `Closes #${n}\n\nCooked by station \`box/claude\`.`,
});
async function servedOnes(ages: number[], now: number): Promise<Board["rail"]["colonnes"][number]["cartes"]> {
  const closedEntries = ages.map((ms, i) => closedOne(i + 1, new Date(now - ms).toISOString()));
  const call = async (path: string) => {
    if (path.includes("/pulls?state=closed")) return ok(closedEntries);
    if (path.includes("/pulls?") || path.includes("/issues?")) return ok([]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
    if (path.includes("/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
    return { status: 404, data: {} };
  };
  const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(now) });
  assert.ok(readOne.lu);
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts));
  const seenOne = boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: readOne.luLe });
  return seenOne.rail.colonnes.find(({ nom: name }) => name === "Served")?.cartes ?? [];
}

test("a merged card says 'merged N ago', the exact wording, at each boundary of the duration", async () => {
  const theCase: [number, string][] = [[0, "0 s"], [59_999, "59 s"], [60_000, "1 min"], [59 * 60_000 + 59_000, "59 min"], [60 * 60_000, "1 h 00"], [171 * 60_000, "2 h 51"]];
  const cards = await servedOnes(theCase.map(([ms]) => ms), T0);
  assert.equal(cards.length, theCase.length);
  for (const [i, [, said]] of theCase.entries()) {
    const card = cards.find((c) => c.ticket === i + 1) ?? assert.fail(`card ${i + 1}`);
    const merged = card.dit?.find((d) => d.libelle === "merged");
    assert.equal(merged?.valeur, `${said} ago`);
    assert.ok(!card.dit?.some((d) => d.libelle === "served"), "'served … before the reading' is replaced, not repeated");
  }
});

test("the merge age grows with the reading time, never negative", async () => {
  const a = (await servedOnes([10_000], T0))[0]?.dit?.find((d) => d.libelle === "merged")?.valeur;
  const b = (await servedOnes([10_000 + 5 * 60_000], T0 + 5 * 60_000))[0]?.dit?.find((d) => d.libelle === "merged")?.valeur;
  assert.equal(a, "10 s ago");
  assert.equal(b, "5 min ago");
  assert.equal(duration(-5_000), "0 s");
});
