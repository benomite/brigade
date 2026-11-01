// L'onglet Cooks ne dit « no station is known to serve this project » que si aucune station ne le sert (#1991, épique #1986) :
// une box qui le sert, déclarée sur le compte mais absente du fichier des projets de l'app, suffit à le taire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { aucuneStationNeSert, AUCUNE_STATION } from "../../../src/vue/cooks/sans-station.js";

const box = { principale: true, bloquee: false };

describe("aucuneStationNeSert", () => {
  test("a box serves the project, the local station is not in the declared list: no waiting message", () => {
    assert.equal(aucuneStationNeSert({}, [box]), false);
  });
  test("a box that does not answer still serves it: the tab names it, it does not say nobody serves", () => {
    assert.equal(aucuneStationNeSert({}, [box]), false);
  });
  test("no station serves the project: the existing waiting message stays", () => {
    assert.equal(aucuneStationNeSert({}, []), true);
    assert.equal(aucuneStationNeSert({}, [{ principale: false, bloquee: true }]), true);
    assert.match(AUCUNE_STATION, /no station is known to serve this project yet/);
  });
  test("the other states are unchanged", () => {
    assert.equal(aucuneStationNeSert({ servi: true }, []), false);
    assert.equal(aucuneStationNeSert({ ici: true }, []), false);
    assert.equal(aucuneStationNeSert({ sansStation: true }, []), false);
  });
});
