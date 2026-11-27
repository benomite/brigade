// Les faits qu'une station écrit d'elle dans son gist (`status`, #4743) : lus sur GitHub, la page de la station
// les dit — sa version, ses cooks, sa dernière mise à jour, ce qui reste du quota de GitHub, et pourquoi elle refuse de cuisiner.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FILE_PAIRING, FILE_STATION } from "../../src/stations/document.ts";
import { holdStations, type SeenOfStations } from "../../src/stations/stations.ts";
import type { GitHubOfStations } from "../../src/stations/github.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { lineOfStation, type Home } from "../../src/home.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { playTheVue, openAllTheStations, repos } from "../helpers/false-vue.ts";

const NOW = Date.parse("2026-11-27T12:00:00Z");
// Ce que la station écrit : le document de runtime/src/station-gist.ts.
const GIST = {
  brigade: "station",
  nom: "box",
  machine: "Linux 6.1",
  version: "1.7.2",
  projets: ["alpha"],
  signeDeVie: new Date(NOW - 10_000).toISOString(),
  cadenceMs: 540_000,
  arreteeLe: null,
  appairage: null,
  echus: [],
  status: {
    version: "1.7.2",
    since: "2026-11-27T08:00:00.000Z",
    updatedAt: "2026-11-27T11:59:50.000Z",
    projects: ["alpha"],
    cooks: [{ project: "alpha", issue: 7, since: "2026-11-27T11:30:00.000Z" }],
    update: { installed: "1.7.2", available: null, frozen: false, held: null, checkedAt: "2026-11-27T11:55:00.000Z", last: { result: "rolled-back", version: "1.7.1", at: "2026-11-27T09:00:00.000Z" } },
    quota: { core: { limit: 5000, remaining: 4321, resetsAt: "2026-11-27T13:00:00.000Z" }, graphql: null },
    refusal: "gamma: no agent launched: no sandbox",
    refused: { gamma: "no agent launched: no sandbox" },
  },
};

const github: GitHubOfStations = {
  lister: async () => [{ id: "g1", misAJour: "1", appairee: true }],
  lire: async () => ({ [FILE_STATION]: JSON.stringify(GIST), [FILE_PAIRING]: JSON.stringify({ appaireeLe: "2026-11-01T00:00:00Z", empreinte: "x" }) }),
  ecrire: async () => {},
  supprimer: async () => {},
};

async function seen(): Promise<SeenOfStations> {
  const stations = holdStations({ github, surLecture: () => {}, maintenant: () => NOW, cadenceMs: 3_600_000 });
  try {
    return await stations.relire();
  } finally {
    stations.fermer();
  }
}

test("la page d'une station dit les faits de son gist : version, cooks, dernière mise à jour, quota, refus", async () => {
  const stations = await seen();
  const [station] = stations.stations;
  assert.ok(station?.faits, "les faits du gist sont lus");
  const home: Home = { projets: [], stations: [lineOfStation(station, 1)], sante: { ton: "vert", dit: "", survol: "" } };
  const played = await playTheVue({
    demarrage: () => ({ configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS, gestes: {}, banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined, stations, accueil: home }),
    espace: () => [],
  });
  await openAllTheStations(played);
  played.element("toutes-les-stations").dessous("button").find(({ className, textContent }) => className === "ligne" && textContent.startsWith("box"))?.click();
  await repos();
  const text = played.element("station").textContent;
  assert.match(text, /version 1\.7\.2 · running for 4 h/);
  assert.match(text, /cooks running: alpha #7/);
  assert.match(text, /last update: rolled back on 1\.7\.1, 3 h ago/);
  assert.match(text, /GitHub quota left: core 4321\/5000/);
  assert.match(text, /refuses to cook: gamma: no agent launched: no sandbox/);
});

test("une station qui ne publie pas ses faits n'en dit aucun", async () => {
  const { status: _, ...without } = GIST;
  const stations = holdStations({ github: { ...github, lire: async () => ({ [FILE_STATION]: JSON.stringify(without), [FILE_PAIRING]: "{}" }) }, surLecture: () => {}, maintenant: () => NOW, cadenceMs: 3_600_000 });
  try {
    assert.equal((await stations.relire()).stations[0]?.faits, undefined);
  } finally {
    stations.fermer();
  }
});
