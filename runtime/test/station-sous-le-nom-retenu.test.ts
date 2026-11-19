// #3868 : la cuisine de la machine réclame sous le nom de la station, pas sous celui que la décision du projet écrit encore.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sousLeNomRetenu } from "../src/station/nom.ts";
import { lireStations } from "../src/stations-declarees.ts";

const DECLAREES = lireStations({ BRIGADE_STATIONS: "box/claude:3:code,box/playwright:2:navigateur-headless,mac/claude:2:code:distante" });

test("les stations d'ici prennent le nom retenu, une distante garde le sien", () => {
  const noms = sousLeNomRetenu(DECLAREES, { BRIGADE_STATION_NOM: "parade-box" }).map(({ nom }) => nom);
  assert.deepEqual(noms, ["parade-box/claude", "parade-box/playwright", "mac/claude"]);
});

test("sans nom retenu, rien ne change", () => {
  assert.deepEqual(sousLeNomRetenu(DECLAREES, {}), DECLAREES);
});
