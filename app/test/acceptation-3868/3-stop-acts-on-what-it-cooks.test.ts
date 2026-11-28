// #3868, critère 3 : « Stop cooking here » sur la carte de la box agit sur la station qui cuit vraiment — sa sélection sur GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { LineOfStation } from "../../src/cooking.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { actionOfStop } from "../../src/vue/project/stations/StopStation.js";
import { servingOf } from "../../src/vue/stations-tab/state.js";

const NOW = Date.parse("2026-11-19T12:00:00.000Z");
const REPOSITORY = "benomite/brigade";
// The box as the app reads it: one registration (the GitHub-only service, `parade-box`) and one claims line from the
// project's kitchen (`box/claude`, cooking #3864).
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "", dit: "online", version: "2.4.0", projets: ["brigade"], max: null };
const MAC: StationVue = { ...BOX, id: "gmac", nom: "macbook", machine: "macOS 25.0.0", projets: [] };
const KITCHEN: LineOfStation = { station: "box/claude", distante: true, etat: "cooking", dit: "", survol: "", presente: true, cooks: [{ ticket: 3864, titre: "ticket 3864", station: "box/claude" }], agents: [] };
const servingOnes = () => servingOf({ projet: "brigade", lignes: [KITCHEN], stations: [BOX, MAC], locale: "gmac", maintenant: NOW });

test("stopping the box's card removes the project from the station that really cooks it", async () => {
  const cards = servingOnes().filter(({ ici: here }) => !here);
  assert.equal(cards.length, 1, `one card for the box: ${cards.map(({ nom: name }) => name).join(", ")}`);
  const card = cards[0] ?? assert.fail("no card");
  assert.equal(card.id, "gbox", "the card is the box's registration, so its gestures reach it");
  const calls: string[] = [];
  const action = actionOfStop(
    { projet: "brigade", depot: REPOSITORY, station: { nom: card.nom, ici: card.ici }, selection: { id: card.id, depots: [REPOSITORY, "benomite/autre"] } },
    {
      retirerIci: () => Promise.resolve({ depots: [] }),
      choisir: (id, repositories) => (calls.push(`${id} ${repositories.join(",")}`), Promise.resolve({ selection: repositories })),
    },
  );
  assert.ok(action !== undefined && "ecrire" in action, "a stop gesture exists");
  await action.ecrire();
  assert.deepEqual(calls, ["gbox benomite/autre"]);
});
