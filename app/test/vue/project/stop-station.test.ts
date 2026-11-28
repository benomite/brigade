// « Stop cooking here » (#3402, project/stations/StopStation.js) : le geste qui arrête chaque sorte de station, et ce que la
// ligne en dit — le projet retiré, ou pourquoi rien n'a changé. Et la carte de cet ordinateur, que sa liste fait aller et
// venir (stations-tab/state.js, `servantesDe`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationVue } from "../../../src/stations/stations.ts";
import { haltStation, actionOfStop } from "../../../src/vue/project/stations/StopStation.js";
import { NOT_ANNOUNCED, servingOf } from "../../../src/vue/stations-tab/state.js";

const REPOSITORY = "chef/parade";
const plays = async (action: ReturnType<typeof actionOfStop>) => (action === undefined ? assert.fail("aucun geste") : haltStation(action));

describe("arrêter cet ordinateur", () => {





});


describe("la carte de cet ordinateur suit sa liste", () => {
  const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", dit: "online", version: "", projets: ["parade"], max: null };
  const BOX: StationVue = { ...MAC, id: "gbox", nom: "parade-box", machine: "Linux 6.1.0" };
  const base = { projet: "parade", stations: [MAC, BOX], locale: "gmac", maintenant: 0 };

  test("sans la liste lue, ce que les stations publient", () => {
    assert.deepEqual(servingOf(base).map(({ nom: name, ici: here }) => [name, here]), [["macbook", true], ["parade-box", false]]);
  });

  test("retiré de la liste, cet ordinateur n'a plus de carte, même s'il publie encore le servir", () => {
    assert.deepEqual(servingOf({ ...base, iciSert: false }).map(({ nom: name }) => name), ["parade-box"]);
  });

  test("ajouté à la liste, il a sa carte avant de publier le servir ; sans station lue, sous le nom de cet ordinateur", () => {
    const withoutIt = [{ ...MAC, projets: [] }, BOX];
    assert.deepEqual(servingOf({ ...base, stations: withoutIt, iciSert: true }).map(({ nom: name, ici: here, etat: state }) => [name, here, state]), [["macbook", true, "en-ligne"], ["parade-box", false, "en-ligne"]]);
    const unknown = servingOf({ ...base, stations: [BOX], locale: null, iciSert: true, hote: "this Mac" });
    assert.deepEqual(unknown.map(({ nom: name, ici: here, dit: said }) => [name, here, said]), [["this Mac", true, NOT_ANNOUNCED], ["parade-box", false, "online"]]);
  });
});
