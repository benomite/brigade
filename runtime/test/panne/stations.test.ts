// #4214 : les stations que la panne juge — celles qui servent le projet, en marche quand elles sont disponibles.
import assert from "node:assert/strict";
import { test } from "node:test";
import { outageStations } from "../../src/outage/stations.ts";

const MAINTENANT = Date.parse("2026-11-25T10:00:00.000Z");
const station = (name: string, stoppedAt: string | null, selection: string[] | null) => ({ name, lastSeen: "2026-11-25T09:59:30.000Z", stoppedAt, refreshMs: 120_000, selection });

test("illisibles : null, jamais une station dite arrêtée", () => {
  assert.equal(outageStations({ illisibles: "rate limited" }, "o/espace", MAINTENANT), null);
});

test("celles qui servent le projet, chacune en marche ou non ; une autre du compte n'en est pas", () => {
  const lues = [station("box", null, ["O/Espace"]), station("pc", "2026-11-25T09:59:50.000Z", ["o/espace"]), station("mac", null, ["o/autre"])];
  assert.deepEqual(outageStations({ lues }, "o/espace", MAINTENANT), [{ nom: "box/claude", enMarche: true }, { nom: "pc/claude", enMarche: false }]);
});
