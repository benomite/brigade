// Le bouton d'une panne, joué par le process principal : relire GitHub, écarter la ligne, lancer
// le login — celui de la station de cet ordinateur seulement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { playOutage, REREAD_THE_STATION, type OptionsActions } from "../../src/outages/actions.ts";
import type { Outage } from "../../src/outages/outages.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";

const UNREACHABLE: Outage = { cle: "injoignable", sujet: "injoignable", ligne: "offline for 10 min", survol: "", bouton: { libelle: "check again", geste: "relire" } };
const UPDATE: Outage = { cle: "mise-a-jour:2026-10-15T11:56:00.000Z", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed", survol: "", bouton: { libelle: "dismiss", geste: "ecarter" } };
const CONNECTION: Outage = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "", bouton: { libelle: "log in", geste: "login" } };

const station = (outages: Outage[]): StationVue => ({ id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: outages, dit: "online", version: "1.4.0", projets: [], max: null });

function ofActions(outages: Outage[], rereadOne: SeenOfStations = { a: "", stations: [station([])] }, locale: string | null = null) {
  const done = { relectures: 0, ecartees: [] as string[], logins: 0 };
  const options: OptionsActions = {
    stations: {
      vu: () => ({ a: "", stations: [station(outages)] }),
      relire: async () => (done.relectures++, rereadOne),
      ecarter: (id, key) => void done.ecartees.push(`${id} ${key}`),
    },
    stationLocale: () => locale,
    login: async () => (done.logins++, { fait: "the login page opens in your browser" }),
  };
  return { options, fait: done };
}

test("« check again » relit GitHub tout de suite, et dit si la station a reparlé", async () => {
  const back = ofActions([UNREACHABLE]);
  assert.deepEqual(await playOutage(back.options, "g1", "injoignable"), { fait: "box is back" });
  assert.equal(back.fait.relectures, 1);
  const silentOne = ofActions([UNREACHABLE], { a: "", stations: [station([UNREACHABLE])] });
  assert.deepEqual(await playOutage(silentOne.options, "g1", "injoignable"), { fait: "still no sign of life from box on GitHub" });
  const withoutGitHub = ofActions([UNREACHABLE], { a: "", stations: [station([UNREACHABLE])], sans: "your stations could not be read on GitHub — error connecting to api.github.com" });
  assert.deepEqual(await playOutage(withoutGitHub.options, "g1", "injoignable"), { refus: "your stations could not be read on GitHub — error connecting to api.github.com" });
});

test("« dismiss » écarte la mise à jour revenue en arrière de la ligne de sa station", async () => {
  const { options, fait: done } = ofActions([UPDATE]);
  assert.deepEqual(await playOutage(options, "g1", UPDATE.cle), { fait: "dismissed" });
  assert.deepEqual(done.ecartees, [`g1 ${UPDATE.cle}`]);
});

test("« log in » lance le login de la station de cet ordinateur ; celui d'une autre station ne part pas d'ici, et le refus le dit", async () => {
  const here = ofActions([CONNECTION], undefined, "g1");
  assert.deepEqual(await playOutage(here.options, "g1", CONNECTION.cle), { fait: "the login page opens in your browser" });
  assert.equal(here.fait.logins, 1);
  const elsewhere = ofActions([CONNECTION], undefined, "g7");
  assert.deepEqual(await playOutage(elsewhere.options, "g1", CONNECTION.cle), { refus: "box is not this computer: its login is not launched from this app yet — it is done on box itself" });
  assert.equal(elsewhere.fait.logins, 0);
  const workstation = ofActions([CONNECTION]);
  assert.ok("refus" in (await playOutage(workstation.options, "g1", CONNECTION.cle)));
});

test("une panne qui n'est plus sur la ligne — relue entre-temps, ou jamais montrée — ne joue rien", async () => {
  const { options, fait: done } = ofActions([UPDATE]);
  for (const [id, key] of [["g1", "injoignable"], ["g2", UPDATE.cle], [undefined, null]]) {
    assert.deepEqual(await playOutage(options, id, key), { refus: "this breakdown is no longer shown: the station was read again in the meantime" });
  }
  assert.deepEqual(done, { relectures: 0, ecartees: [], logins: 0 });
});

test("« check again » d'une station qui ne cuit pas encore relit GitHub sans viser une panne, et dit si elle a reparlé (#1758)", async () => {
  const outside = { ...station([]), etat: "hors-ligne" as const };
  const silentOne = ofActions([], { a: "", stations: [outside] });
  assert.deepEqual(await playOutage(silentOne.options, "g1", REREAD_THE_STATION), { fait: "still no sign of life from box on GitHub" });
  assert.equal(silentOne.fait.relectures, 1);
  assert.deepEqual(await playOutage(ofActions([]).options, "g1", REREAD_THE_STATION), { fait: "box is back" });
  assert.deepEqual(await playOutage(ofActions([], { a: "", stations: [] }).options, "g1", REREAD_THE_STATION), { refus: "this station is no longer paired with this app" });
});
