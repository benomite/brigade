// #3868, critère 2 : la carte de la box dit ce qu'elle cuit, quelle que soit la cuisine de la box qui le cuit.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { LigneDeStation } from "../../src/cuisson.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { servantesDe } from "../../src/vue/stations-tab/etat.js";

const MAINTENANT = Date.parse("2026-11-19T12:00:00.000Z");
const DEPOT = "benomite/brigade";
// The box as the app reads it: one registration (the GitHub-only service, `parade-box`) and one claims line from the
// project's kitchen (`box/claude`, cooking #3864).
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "2.4.0", projets: ["brigade"], max: null };
const MAC: StationVue = { ...BOX, id: "gmac", nom: "macbook", machine: "macOS 25.0.0", projets: [] };
const CUISINE: LigneDeStation = { station: "box/claude", distante: true, etat: "cooking", dit: "", survol: "", presente: true, cooks: [{ ticket: 3864, titre: "ticket 3864", station: "box/claude" }], agents: [] };
const servantes = () => servantesDe({ projet: "brigade", lignes: [CUISINE], stations: [BOX, MAC], locale: "gmac", maintenant: MAINTENANT });

test("the box's single card says it cooks #3864, whichever kitchen of the box cooks it", () => {
  const cartes = servantes().filter(({ ici }) => !ici);
  assert.equal(cartes.length, 1, `one card for the box: ${cartes.map(({ nom }) => nom).join(", ")}`);
  assert.deepEqual(cartes[0]?.cooks.map(({ ticket }) => ticket), [3864]);
});
