// Le bouton d'une panne, joué par le process principal : relire GitHub, écarter la ligne, lancer
// le login — celui de la station de cet ordinateur seulement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jouerOutage, RELIRE_LA_STATION, type OptionsActions } from "../../src/outages/actions.ts";
import type { Outage } from "../../src/outages/outages.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";

const INJOIGNABLE: Outage = { cle: "injoignable", sujet: "injoignable", ligne: "offline for 10 min", survol: "", bouton: { libelle: "check again", geste: "relire" } };
const UPDATE: Outage = { cle: "mise-a-jour:2026-10-15T11:56:00.000Z", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed", survol: "", bouton: { libelle: "dismiss", geste: "ecarter" } };
const CONNECTION: Outage = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "", bouton: { libelle: "log in", geste: "login" } };

const station = (outages: Outage[]): StationVue => ({ id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: outages, dit: "online", version: "1.4.0", projets: [], max: null });

function desActions(outages: Outage[], relue: VuDesStations = { a: "", stations: [station([])] }, locale: string | null = null) {
  const fait = { relectures: 0, ecartees: [] as string[], logins: 0 };
  const options: OptionsActions = {
    stations: {
      vu: () => ({ a: "", stations: [station(outages)] }),
      relire: async () => (fait.relectures++, relue),
      ecarter: (id, cle) => void fait.ecartees.push(`${id} ${cle}`),
    },
    stationLocale: () => locale,
    login: async () => (fait.logins++, { fait: "the login page opens in your browser" }),
  };
  return { options, fait };
}

test("« check again » relit GitHub tout de suite, et dit si la station a reparlé", async () => {
  const revenue = desActions([INJOIGNABLE]);
  assert.deepEqual(await jouerOutage(revenue.options, "g1", "injoignable"), { fait: "box is back" });
  assert.equal(revenue.fait.relectures, 1);
  const muette = desActions([INJOIGNABLE], { a: "", stations: [station([INJOIGNABLE])] });
  assert.deepEqual(await jouerOutage(muette.options, "g1", "injoignable"), { fait: "still no sign of life from box on GitHub" });
  const sansGitHub = desActions([INJOIGNABLE], { a: "", stations: [station([INJOIGNABLE])], sans: "your stations could not be read on GitHub — error connecting to api.github.com" });
  assert.deepEqual(await jouerOutage(sansGitHub.options, "g1", "injoignable"), { refus: "your stations could not be read on GitHub — error connecting to api.github.com" });
});

test("« dismiss » écarte la mise à jour revenue en arrière de la ligne de sa station", async () => {
  const { options, fait } = desActions([UPDATE]);
  assert.deepEqual(await jouerOutage(options, "g1", UPDATE.cle), { fait: "dismissed" });
  assert.deepEqual(fait.ecartees, [`g1 ${UPDATE.cle}`]);
});

test("« log in » lance le login de la station de cet ordinateur ; celui d'une autre station ne part pas d'ici, et le refus le dit", async () => {
  const ici = desActions([CONNECTION], undefined, "g1");
  assert.deepEqual(await jouerOutage(ici.options, "g1", CONNECTION.cle), { fait: "the login page opens in your browser" });
  assert.equal(ici.fait.logins, 1);
  const ailleurs = desActions([CONNECTION], undefined, "g7");
  assert.deepEqual(await jouerOutage(ailleurs.options, "g1", CONNECTION.cle), { refus: "box is not this computer: its login is not launched from this app yet — it is done on box itself" });
  assert.equal(ailleurs.fait.logins, 0);
  const workstation = desActions([CONNECTION]);
  assert.ok("refus" in (await jouerOutage(workstation.options, "g1", CONNECTION.cle)));
});

test("une panne qui n'est plus sur la ligne — relue entre-temps, ou jamais montrée — ne joue rien", async () => {
  const { options, fait } = desActions([UPDATE]);
  for (const [id, cle] of [["g1", "injoignable"], ["g2", UPDATE.cle], [undefined, null]]) {
    assert.deepEqual(await jouerOutage(options, id, cle), { refus: "this breakdown is no longer shown: the station was read again in the meantime" });
  }
  assert.deepEqual(fait, { relectures: 0, ecartees: [], logins: 0 });
});

test("« check again » d'une station qui ne cuit pas encore relit GitHub sans viser une panne, et dit si elle a reparlé (#1758)", async () => {
  const outside = { ...station([]), etat: "hors-ligne" as const };
  const muette = desActions([], { a: "", stations: [outside] });
  assert.deepEqual(await jouerOutage(muette.options, "g1", RELIRE_LA_STATION), { fait: "still no sign of life from box on GitHub" });
  assert.equal(muette.fait.relectures, 1);
  assert.deepEqual(await jouerOutage(desActions([]).options, "g1", RELIRE_LA_STATION), { fait: "box is back" });
  assert.deepEqual(await jouerOutage(desActions([], { a: "", stations: [] }).options, "g1", RELIRE_LA_STATION), { refus: "this station is no longer paired with this app" });
});
