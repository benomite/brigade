// #3868, critère 1 : une machine, une carte, un seul nom — la cuisine du projet (box/claude) et l'inscription de la box (parade-box) sont la même station.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { LineDeStation } from "../../src/cooking.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { servantesDe } from "../../src/vue/stations-tab/state.js";

const MAINTENANT = Date.parse("2026-11-19T12:00:00.000Z");
const REPOSITORY = "benomite/brigade";
// The box as the app reads it: one registration (the GitHub-only service, `parade-box`) and one claims line from the
// project's kitchen (`box/claude`, cooking #3864).
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "2.4.0", projets: ["brigade"], max: null };
const MAC: StationVue = { ...BOX, id: "gmac", nom: "macbook", machine: "macOS 25.0.0", projets: [] };
const KITCHEN: LineDeStation = { station: "box/claude", distante: true, etat: "cooking", dit: "", survol: "", presente: true, cooks: [{ ticket: 3864, titre: "ticket 3864", station: "box/claude" }], agents: [] };
const servantes = () => servantesDe({ projet: "brigade", lignes: [KITCHEN], stations: [BOX, MAC], locale: "gmac", maintenant: MAINTENANT });

test("the box shows as one card under one name, not as box/claude and parade-box", () => {
  const cards = servantes().filter(({ ici }) => !ici);
  assert.equal(cards.length, 1, `one card for the box: ${cards.map(({ nom: name }) => name).join(", ")}`);
  const noms = servantes().map(({ nom: name }) => name);
  assert.ok(!(noms.includes("box/claude") && noms.includes("parade-box")), `the box has two names: ${noms.join(", ")}`);
});
