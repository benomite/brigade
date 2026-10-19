// Le bouton d'une panne, joué par le process principal : relire GitHub, écarter la ligne, lancer
// le login — celui de la station de cet ordinateur seulement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jouerPanne, type OptionsGestes } from "../../src/pannes/gestes.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";

const INJOIGNABLE: Panne = { cle: "injoignable", sujet: "injoignable", ligne: "offline for 10 min", survol: "", bouton: { libelle: "check again", geste: "relire" } };
const MISE_A_JOUR: Panne = { cle: "mise-a-jour:2026-10-15T11:56:00.000Z", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed", survol: "", bouton: { libelle: "dismiss", geste: "ecarter" } };
const CONNECTION: Panne = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "", bouton: { libelle: "log in", geste: "login" } };

const station = (pannes: Panne[]): StationVue => ({ id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes, dit: "online", version: "1.4.0", projets: [], max: null });

function desGestes(pannes: Panne[], relue: VuDesStations = { a: "", stations: [station([])] }, locale: string | null = null) {
  const fait = { relectures: 0, ecartees: [] as string[], logins: 0 };
  const options: OptionsGestes = {
    stations: {
      vu: () => ({ a: "", stations: [station(pannes)] }),
      relire: async () => (fait.relectures++, relue),
      ecarter: (id, cle) => void fait.ecartees.push(`${id} ${cle}`),
    },
    stationLocale: () => locale,
    login: async () => (fait.logins++, { fait: "the login page opens in your browser" }),
  };
  return { options, fait };
}

test("« check again » relit GitHub tout de suite, et dit si la station a reparlé", async () => {
  const revenue = desGestes([INJOIGNABLE]);
  assert.deepEqual(await jouerPanne(revenue.options, "g1", "injoignable"), { fait: "box is back" });
  assert.equal(revenue.fait.relectures, 1);
  const muette = desGestes([INJOIGNABLE], { a: "", stations: [station([INJOIGNABLE])] });
  assert.deepEqual(await jouerPanne(muette.options, "g1", "injoignable"), { fait: "still no sign of life from box on GitHub" });
  const sansGitHub = desGestes([INJOIGNABLE], { a: "", stations: [station([INJOIGNABLE])], sans: "your stations could not be read on GitHub — error connecting to api.github.com" });
  assert.deepEqual(await jouerPanne(sansGitHub.options, "g1", "injoignable"), { refus: "your stations could not be read on GitHub — error connecting to api.github.com" });
});

test("« dismiss » écarte la mise à jour revenue en arrière de la ligne de sa station", async () => {
  const { options, fait } = desGestes([MISE_A_JOUR]);
  assert.deepEqual(await jouerPanne(options, "g1", MISE_A_JOUR.cle), { fait: "dismissed" });
  assert.deepEqual(fait.ecartees, [`g1 ${MISE_A_JOUR.cle}`]);
});

test("« log in » lance le login de la station de cet ordinateur ; celui d'une autre station ne part pas d'ici, et le refus le dit", async () => {
  const ici = desGestes([CONNECTION], undefined, "g1");
  assert.deepEqual(await jouerPanne(ici.options, "g1", CONNECTION.cle), { fait: "the login page opens in your browser" });
  assert.equal(ici.fait.logins, 1);
  const ailleurs = desGestes([CONNECTION], undefined, "g7");
  assert.deepEqual(await jouerPanne(ailleurs.options, "g1", CONNECTION.cle), { refus: "box is not this computer: its login is not launched from this app yet — it is done on box itself" });
  assert.equal(ailleurs.fait.logins, 0);
  const workstation = desGestes([CONNECTION]);
  assert.ok("refus" in (await jouerPanne(workstation.options, "g1", CONNECTION.cle)));
});

test("une panne qui n'est plus sur la ligne — relue entre-temps, ou jamais montrée — ne joue rien", async () => {
  const { options, fait } = desGestes([MISE_A_JOUR]);
  for (const [id, cle] of [["g1", "injoignable"], ["g2", MISE_A_JOUR.cle], [undefined, null]]) {
    assert.deepEqual(await jouerPanne(options, id, cle), { refus: "this breakdown is no longer shown: the station was read again in the meantime" });
  }
  assert.deepEqual(fait, { relectures: 0, ecartees: [], logins: 0 });
});
