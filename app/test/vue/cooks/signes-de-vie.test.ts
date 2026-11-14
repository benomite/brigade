// Les signes de vie des stations du compte, que l'onglet Cooks d'un projet sur GitHub seul lit (#2358) : relus au pas où
// les stations les écrivent, pas à chaque lecture du rail ; une lecture faite ailleurs les remplace ; un échec garde la
// dernière lecture réussie.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationsDuCompte } from "../../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { PAS_DES_SIGNES_MS, signesDe, tenirLesSignesDeVie } from "../../../src/vue/cooks/signes-de-vie.ts";

const station = (name: string, lastSeen: string) => ({ id: `g${name}`, name, platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", account: "chef", available: true, registeredAt: "2026-11-01T00:00:00.000Z", lastSeen, stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] });
const listees = (...stations: ReturnType<typeof station>[]): StationsDuCompte => ({ state: "listed", stations, unreadable: [] });

describe("les signes de vie des stations du compte", () => {
  test("une lecture listée : le signe de vie de chacune et les dépôts qui lui sont choisis ; sinon, la raison", () => {
    assert.deepEqual(signesDe(listees(station("box", "2026-11-05T09:59:00.000Z"))), { lus: [{ id: "gbox", name: "box", lastSeen: "2026-11-05T09:59:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] }] });
    assert.deepEqual(signesDe({ state: "unavailable", cause: "network", reason: "GitHub could not be reached." }), { illisible: "GitHub could not be reached." });
  });

  test("relus au pas des stations, pas plus vite ; une lecture faite ailleurs les remplace sans appel", async () => {
    let instant = 0;
    let lectures = 0;
    const signes = tenirLesSignesDeVie({ lire: async () => (lectures++, listees(station("box", `2026-11-05T09:0${lectures}:00.000Z`))), maintenant: () => instant });
    const [une, deux] = await Promise.all([signes.signes(), signes.signes()]);
    assert.equal(lectures, 1);
    assert.deepEqual(une, deux);
    instant += PAS_DES_SIGNES_MS - 1;
    await signes.signes();
    assert.equal(lectures, 1);
    instant += 1;
    assert.deepEqual(await signes.signes(), { lus: [{ id: "gbox", name: "box", lastSeen: "2026-11-05T09:02:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] }] });
    signes.poser(listees(station("mac", "2026-11-05T09:30:00.000Z")));
    assert.deepEqual((await signes.signes()) as unknown, { lus: [{ id: "gmac", name: "mac", lastSeen: "2026-11-05T09:30:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: ["chef/parade"] }] });
    assert.equal(lectures, 2);
  });

  test("un échec garde la dernière lecture réussie ; sans aucune, il dit pourquoi", async () => {
    let instant = 0;
    let rate = true;
    const signes = tenirLesSignesDeVie({ lire: async () => (rate ? Promise.reject(new Error("gh: timeout")) : listees(station("box", "2026-11-05T09:59:00.000Z"))), maintenant: () => instant });
    assert.deepEqual(await signes.signes(), { illisible: "your stations could not be read on GitHub: gh: timeout" });
    rate = false;
    instant += PAS_DES_SIGNES_MS;
    assert.ok("lus" in (await signes.signes()));
    rate = true;
    instant += PAS_DES_SIGNES_MS;
    assert.ok("lus" in (await signes.signes()));
    signes.poser({ state: "unavailable", cause: "network", reason: "offline" });
    assert.ok("lus" in (await signes.signes()));
  });
});
