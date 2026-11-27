// Les signes de vie des stations du compte, que l'onglet Cooks d'un projet sur GitHub seul lit (#2358) : relus au pas où
// les stations les écrivent, pas à chaque lecture du rail ; une lecture faite ailleurs les remplace ; un échec garde la
// dernière lecture réussie.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationsDuCompte } from "../../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { NOT_OF_SIGNS_MS, signsOf, holdTheSignsOfLife } from "../../../src/vue/cooks/signs-of-life.ts";

const station = (name: string, lastSeen: string) => ({ id: `g${name}`, name, platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", account: "chef", available: true, registeredAt: "2026-11-01T00:00:00.000Z", lastSeen, stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] });
const listed = (...stations: ReturnType<typeof station>[]): StationsDuCompte => ({ state: "listed", stations, unreadable: [] });

describe("les signes de vie des stations du compte", () => {
  test("une lecture listée : le signe de vie de chacune et les dépôts qui lui sont choisis ; sinon, la raison", () => {
    assert.deepEqual(signsOf(listed(station("box", "2026-11-05T09:59:00.000Z"))), { lus: [{ id: "gbox", name: "box", lastSeen: "2026-11-05T09:59:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] }] });
    assert.deepEqual(signsOf({ state: "unavailable", cause: "network", reason: "GitHub could not be reached." }), { illisible: "GitHub could not be reached." });
  });

  test("relus au pas des stations, pas plus vite ; une lecture faite ailleurs les remplace sans appel", async () => {
    let instant = 0;
    let readings = 0;
    const signs = holdTheSignsOfLife({ lire: async () => (readings++, listed(station("box", `2026-11-05T09:0${readings}:00.000Z`))), maintenant: () => instant });
    const [one, two] = await Promise.all([signs.signes(), signs.signes()]);
    assert.equal(readings, 1);
    assert.deepEqual(one, two);
    instant += NOT_OF_SIGNS_MS - 1;
    await signs.signes();
    assert.equal(readings, 1);
    instant += 1;
    assert.deepEqual(await signs.signes(), { lus: [{ id: "gbox", name: "box", lastSeen: "2026-11-05T09:02:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] }] });
    signs.poser(listed(station("mac", "2026-11-05T09:30:00.000Z")));
    assert.deepEqual((await signs.signes()) as unknown, { lus: [{ id: "gmac", name: "mac", lastSeen: "2026-11-05T09:30:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] }] });
    assert.equal(readings, 2);
  });

  test("un échec garde la dernière lecture réussie ; sans aucune, il dit pourquoi", async () => {
    let instant = 0;
    let rate = true;
    const signs = holdTheSignsOfLife({ lire: async () => (rate ? Promise.reject(new Error("gh: timeout")) : listed(station("box", "2026-11-05T09:59:00.000Z"))), maintenant: () => instant });
    assert.deepEqual(await signs.signes(), { illisible: "your stations could not be read on GitHub: gh: timeout" });
    rate = false;
    instant += NOT_OF_SIGNS_MS;
    assert.ok("lus" in (await signs.signes()));
    rate = true;
    instant += NOT_OF_SIGNS_MS;
    assert.ok("lus" in (await signs.signes()));
    signs.poser({ state: "unavailable", cause: "network", reason: "offline" });
    assert.ok("lus" in (await signs.signes()));
  });
});
