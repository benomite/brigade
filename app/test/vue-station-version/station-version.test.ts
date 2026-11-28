// La version de la station de cet ordinateur à côté de celle de la box (#2191, épique #2182) : sous la liste des stations
// de l'accueil, côte à côte, chacune dite de la même façon. Le statut de cette station suit le contrat du runtime
// (#2189) — `stationVersion`, `latestStationVersion`, `behind` : en retard, la case le dit et nomme la dernière version ;
// à jour, elle le dit ; sans statut lisible, elle dit sa version inconnue, sans erreur ni case vide. Le module est lu
// seul, sur un faux document, puis la vue jouée telle qu'elle est (helpers/false-vue.ts), depuis l'accueil.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, MODELS, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { casesOfVersions, caseOfHere, UNKNOWN, UNKNOWN_BOX, UNKNOWN_HERE, setVersionsOfStations, statusRead, TITLE } from "../../src/vue/station-version/station-version.js";
import { Fake, playTheVue, openAllTheStations, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const A = "2026-11-03T20:00:00.000Z";

const BOX: StationVue = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "", dit: "online", version: "2.4.0", projets: ["parade"], max: null, versionDit: "up to date · on this version for 3 days" };
const MAC: StationVue = { id: "g2", nom: "macbook", machine: "macOS 15", etat: "en-ligne", ligne: "", dit: "online", version: "2.3.1", projets: [], max: null, versionDit: "up to date" };
const IN_DELAY = { stationVersion: "2.3.1", latestStationVersion: "2.4.0", behind: true };
const A_DAY = { stationVersion: "2.4.0", latestStationVersion: "2.4.0", behind: false };

// Ce que les cases disent, dans l'ordre : leur nom, leur phrase, leur ton, et leur survol s'il y en a un.
const readEntries = (block: Fake) =>
  block.children
    .filter(({ className }) => className === "version-d-une-station")
    .map((one) => ({
      nom: one.dessous("strong")[0]?.textContent,
      phrase: one.children.find(({ className }) => className === "phrase")?.textContent,
      ton: one.dataset.ton,
      survol: one.dessous("button").find(({ className }) => className === "aide")?.ariaLabel,
    }));
const set = (status: unknown, stations: StationVue[] | undefined = [BOX, MAC]) => readEntries(setVersionsOfStations(doc, casesOfVersions({ stations, locale: "g2", poste: "this computer", statut: status })) as unknown as Fake);

describe("les trois états de la station de cet ordinateur, à côté de la box", () => {
  test("en retard : la case de ce poste le dit, en jaune, et nomme la dernière version", () => {
    assert.deepEqual(set(IN_DELAY), [
      { nom: "parade-box", phrase: "version 2.4.0 · up to date", ton: "vert", survol: undefined },
      { nom: "this computer", phrase: "version 2.3.1 · behind — 2.4.0 is out", ton: "jaune", survol: undefined },
    ]);
  });

  test("à jour : la case de ce poste le dit, comme celle de la box", () => {
    assert.deepEqual(set(A_DAY), [
      { nom: "parade-box", phrase: "version 2.4.0 · up to date", ton: "vert", survol: undefined },
      { nom: "this computer", phrase: "version 2.4.0 · up to date", ton: "vert", survol: undefined },
    ]);
  });

  test("sans statut, ou un statut illisible : « version unknown », pourquoi au survol — ni erreur, ni case vide", () => {
    for (const status of [undefined, null, "2.3.1", {}, { stationVersion: "", behind: false }, { stationVersion: "2.3.1" }, { stationVersion: "2.3.1", behind: "yes" }]) {
      assert.deepEqual(set(status)[1], { nom: "this computer", phrase: UNKNOWN, ton: "gris", survol: UNKNOWN_HERE }, JSON.stringify(status));
    }
  });

  test("le bloc porte son titre, puis les deux cases côte à côte, la box d'abord", () => {
    const block = setVersionsOfStations(doc, casesOfVersions({ stations: [BOX, MAC], locale: "g2", poste: "this computer", statut: IN_DELAY })) as unknown as Fake;
    assert.equal(block.className, "versions-des-stations");
    assert.equal(block.children[0]?.textContent, TITLE);
    assert.deepEqual(block.children.slice(1).map(({ dataset }) => dataset.ici ?? "box"), ["box", "oui"]);
    // La pastille porte sa forme : la couleur ne dit jamais seule le retard.
    assert.equal(block.children[2]?.children[0]?.dataset.forme, "losange");
  });
});

describe("ce que chaque case lit", () => {
  test("en retard sans dernière version publiée : la case le dit en retard, sans en inventer une", () => {
    assert.equal(caseOfHere("this computer", { stationVersion: "2.3.1", latestStationVersion: null, behind: true }).phrase, "version 2.3.1 · behind");
    assert.deepEqual(statusRead({ stationVersion: " 2.3.1 ", latestStationVersion: "", behind: true }), { stationVersion: "2.3.1", latestStationVersion: null, behind: true });
  });

  test("la box sans « up to date » — hors ligne, ou sa mise à jour échouée — dit sa version, et rien de plus", () => {
    assert.deepEqual(set(A_DAY, [{ ...BOX, versionDit: "on this version for 3 days" }, MAC])[0], { nom: "parade-box", phrase: "version 2.4.0", ton: "gris", survol: undefined });
    assert.deepEqual(set(A_DAY, [{ ...BOX, versionDit: "" }, MAC])[0]?.phrase, "version 2.4.0");
  });

  test("la station de cet ordinateur, un téléphone et une station illisible ne sont pas des box ; sans box lue, la sienne se dit inconnue", () => {
    const phone: StationVue = { ...BOX, id: "g3", nom: "pixel", cuisine: false };
    const unreadable: StationVue = { ...BOX, id: "g4", nom: "g4", etat: "illisible", version: "" };
    assert.deepEqual(set(A_DAY, [BOX, MAC, phone, unreadable]).map(({ nom: name }) => name), ["parade-box", "this computer"]);
    for (const stations of [undefined, [], [MAC]]) {
      assert.deepEqual(casesOfVersions({ stations, locale: "g2", poste: "this computer", statut: A_DAY })[0], { nom: "box", phrase: UNKNOWN, ton: "gris", survol: UNKNOWN_BOX, ici: false });
    }
  });
});

const startup = (stations: SeenOfStations) => ({
  poste: { nom: "this computer", mac: true },
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations,
  projetsDesStations: { a: A, projets: [], locale: "g2", recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommended([]) } satisfies SeenOfProjects,
  accueil: { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } satisfies Home,
});

describe("la vue jouée : sous toutes les stations, sur l'accueil (#3195)", () => {
  test("le statut lu au lancement se pose ; un statut relu le remplace ; un pont qui ne le lit pas laisse la case inconnue", async () => {
    let status: unknown = IN_DELAY;
    const played = await playTheVue({ demarrage: () => startup({ a: A, stations: [BOX, MAC] }), espace: () => [], statutDeLaStation: () => status } as Parameters<typeof playTheVue>[0]);
    await openAllTheStations(played);
    const block = () => played.element("toutes-les-stations").descendants().find(({ className }) => className === "versions-des-stations") ?? assert.fail("pas de versions sous la liste des stations");
    assert.deepEqual(readEntries(block()).map(({ nom: name, phrase: sentence }) => `${name}: ${sentence}`), ["parade-box: version 2.4.0 · up to date", "this computer: version 2.3.1 · behind — 2.4.0 is out"]);
    assert.ok(played.appels.some(({ geste: action }) => action === "statutDeLaStation"));

    played.dire("surStatutDeLaStation", A_DAY);
    await repos();
    assert.equal(readEntries(block())[1]?.phrase, "version 2.4.0 · up to date");

    // Le pont relit ses stations : la case de la box suit, celle de ce poste garde son statut.
    played.dire("surStations", { a: A, stations: [{ ...BOX, version: "2.5.0" }, MAC] });
    await repos();
    assert.deepEqual(readEntries(block()).map(({ phrase: sentence }) => sentence), ["version 2.5.0 · up to date", "version 2.4.0 · up to date"]);

    status = undefined;
    const without = await playTheVue({ demarrage: () => startup({ a: A, stations: [BOX, MAC] }), espace: () => [] });
    await openAllTheStations(without);
    const blockWithout = without.element("toutes-les-stations").descendants().find(({ className }) => className === "versions-des-stations") ?? assert.fail("pas de versions sans statut");
    assert.deepEqual(readEntries(blockWithout)[1], { nom: "this computer", phrase: UNKNOWN, ton: "gris", survol: UNKNOWN_HERE });
  });
});
