// Les signes de vie des stations du compte, que l'onglet Cooks d'un projet sur GitHub seul lit (#2358) : ce qu'une
// lecture des stations du compte en dit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationsDuCompte } from "../../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { signsOf } from "../../../src/vue/cooks/signs-of-life.ts";

const station = (name: string, lastSeen: string) => ({ id: `g${name}`, name, platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", account: "chef", available: true, registeredAt: "2026-11-01T00:00:00.000Z", lastSeen, stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] });
const listed = (...stations: ReturnType<typeof station>[]): StationsDuCompte => ({ state: "listed", stations, unreadable: [] });

describe("les signes de vie des stations du compte", () => {
  test("une lecture listée : le signe de vie de chacune et les dépôts qui lui sont choisis ; sinon, la raison", () => {
    assert.deepEqual(signsOf(listed(station("box", "2026-11-05T09:59:00.000Z"))), { lus: [{ id: "gbox", name: "box", lastSeen: "2026-11-05T09:59:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] }] });
    assert.deepEqual(signsOf({ state: "unavailable", cause: "network", reason: "GitHub could not be reached." }), { illisible: "GitHub could not be reached." });
  });
});
