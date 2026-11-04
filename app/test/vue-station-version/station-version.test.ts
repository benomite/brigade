// La version de la station de cet ordinateur à côté de celle de la box (#2191, épique #2182) : sous la liste des stations
// de l'accueil, côte à côte, chacune dite de la même façon. Le statut de cette station suit le contrat du runtime
// (#2189) — `stationVersion`, `latestStationVersion`, `behind` : en retard, la case le dit et nomme la dernière version ;
// à jour, elle le dit ; sans statut lisible, elle dit sa version inconnue, sans erreur ni case vide. Le module est lu
// seul, sur un faux document, puis la vue jouée telle qu'elle est (aides/fausse-vue.ts), depuis l'accueil.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../../src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { casesDesVersions, caseDIci, INCONNUE, INCONNUE_BOX, INCONNUE_ICI, poserVersionsDesStations, statutLu, TITRE } from "../../src/vue/station-version/station-version.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-11-03T20:00:00.000Z";

const BOX: StationVue = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "2.4.0", projets: ["parade"], max: null, versionDit: "up to date · on this version for 3 days" };
const MAC: StationVue = { id: "g2", nom: "macbook", machine: "macOS 15", etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "2.3.1", projets: [], max: null, versionDit: "up to date" };
const EN_RETARD = { stationVersion: "2.3.1", latestStationVersion: "2.4.0", behind: true };
const A_JOUR = { stationVersion: "2.4.0", latestStationVersion: "2.4.0", behind: false };

// Ce que les cases disent, dans l'ordre : leur nom, leur phrase, leur ton, et leur survol s'il y en a un.
const lues = (bloc: Faux) =>
  bloc.children
    .filter(({ className }) => className === "version-d-une-station")
    .map((une) => ({
      nom: une.dessous("strong")[0]?.textContent,
      phrase: une.children.find(({ className }) => className === "phrase")?.textContent,
      ton: une.dataset.ton,
      survol: une.dessous("button").find(({ className }) => className === "aide")?.ariaLabel,
    }));
const poser = (statut: unknown, stations: StationVue[] | undefined = [BOX, MAC]) => lues(poserVersionsDesStations(doc, casesDesVersions({ stations, locale: "g2", poste: "this Mac", statut })) as unknown as Faux);

describe("les trois états de la station de cet ordinateur, à côté de la box", () => {
  test("en retard : la case de ce poste le dit, en jaune, et nomme la dernière version", () => {
    assert.deepEqual(poser(EN_RETARD), [
      { nom: "parade-box", phrase: "version 2.4.0 · up to date", ton: "vert", survol: undefined },
      { nom: "this Mac", phrase: "version 2.3.1 · behind — 2.4.0 is out", ton: "jaune", survol: undefined },
    ]);
  });

  test("à jour : la case de ce poste le dit, comme celle de la box", () => {
    assert.deepEqual(poser(A_JOUR), [
      { nom: "parade-box", phrase: "version 2.4.0 · up to date", ton: "vert", survol: undefined },
      { nom: "this Mac", phrase: "version 2.4.0 · up to date", ton: "vert", survol: undefined },
    ]);
  });

  test("sans statut, ou un statut illisible : « version unknown », pourquoi au survol — ni erreur, ni case vide", () => {
    for (const statut of [undefined, null, "2.3.1", {}, { stationVersion: "", behind: false }, { stationVersion: "2.3.1" }, { stationVersion: "2.3.1", behind: "yes" }]) {
      assert.deepEqual(poser(statut)[1], { nom: "this Mac", phrase: INCONNUE, ton: "gris", survol: INCONNUE_ICI }, JSON.stringify(statut));
    }
  });

  test("le bloc porte son titre, puis les deux cases côte à côte, la box d'abord", () => {
    const bloc = poserVersionsDesStations(doc, casesDesVersions({ stations: [BOX, MAC], locale: "g2", poste: "this PC", statut: EN_RETARD })) as unknown as Faux;
    assert.equal(bloc.className, "versions-des-stations");
    assert.equal(bloc.children[0]?.textContent, TITRE);
    assert.deepEqual(bloc.children.slice(1).map(({ dataset }) => dataset.ici ?? "box"), ["box", "oui"]);
    // La pastille porte sa forme : la couleur ne dit jamais seule le retard.
    assert.equal(bloc.children[2]?.children[0]?.dataset.forme, "losange");
  });
});

describe("ce que chaque case lit", () => {
  test("en retard sans dernière version publiée : la case le dit en retard, sans en inventer une", () => {
    assert.equal(caseDIci("this Mac", { stationVersion: "2.3.1", latestStationVersion: null, behind: true }).phrase, "version 2.3.1 · behind");
    assert.deepEqual(statutLu({ stationVersion: " 2.3.1 ", latestStationVersion: "", behind: true }), { stationVersion: "2.3.1", latestStationVersion: null, behind: true });
  });

  test("la box sans « up to date » — hors ligne, ou sa mise à jour échouée — dit sa version, et rien de plus", () => {
    assert.deepEqual(poser(A_JOUR, [{ ...BOX, versionDit: "on this version for 3 days" }, MAC])[0], { nom: "parade-box", phrase: "version 2.4.0", ton: "gris", survol: undefined });
    assert.deepEqual(poser(A_JOUR, [{ ...BOX, versionDit: "" }, MAC])[0]?.phrase, "version 2.4.0");
  });

  test("la station de cet ordinateur, un téléphone et une station illisible ne sont pas des box ; sans box lue, la sienne se dit inconnue", () => {
    const telephone: StationVue = { ...BOX, id: "g3", nom: "pixel", cuisine: false };
    const illisible: StationVue = { ...BOX, id: "g4", nom: "g4", etat: "illisible", version: "" };
    assert.deepEqual(poser(A_JOUR, [BOX, MAC, telephone, illisible]).map(({ nom }) => nom), ["parade-box", "this Mac"]);
    for (const stations of [undefined, [], [MAC]]) {
      assert.deepEqual(casesDesVersions({ stations, locale: "g2", poste: "this Mac", statut: A_JOUR })[0], { nom: "box", phrase: INCONNUE, ton: "gris", survol: INCONNUE_BOX, ici: false });
    }
  });
});

const demarrage = (stations: VuDesStations) => ({
  poste: { nom: "this Mac", mac: true },
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations,
  projetsDesStations: { a: A, projets: [], locale: "g2", recommandee: null, avertissements: {}, machines: {}, calibrage: calibrageRecommande([]) } satisfies VuDesProjets,
  accueil: { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } satisfies Accueil,
});

describe("la vue jouée : sur l'accueil, sous la liste des stations", () => {
  test("le statut lu au lancement se pose ; un statut relu le remplace ; un pont qui ne le lit pas laisse la case inconnue", async () => {
    let statut: unknown = EN_RETARD;
    const jouee = await jouerLaVue({ demarrage: () => demarrage({ a: A, stations: [BOX, MAC] }), espace: () => [], statutDeLaStation: () => statut } as Parameters<typeof jouerLaVue>[0]);
    await repos();
    const bloc = () => jouee.element("accueil-stations").descendants().find(({ className }) => className === "versions-des-stations") ?? assert.fail("pas de versions sous la liste des stations");
    assert.deepEqual(lues(bloc()).map(({ nom, phrase }) => `${nom}: ${phrase}`), ["parade-box: version 2.4.0 · up to date", "this Mac: version 2.3.1 · behind — 2.4.0 is out"]);
    assert.ok(jouee.appels.some(({ geste }) => geste === "statutDeLaStation"));

    jouee.dire("surStatutDeLaStation", A_JOUR);
    await repos();
    assert.equal(lues(bloc())[1]?.phrase, "version 2.4.0 · up to date");

    // Le pont relit ses stations : la case de la box suit, celle de ce poste garde son statut.
    jouee.dire("surStations", { a: A, stations: [{ ...BOX, version: "2.5.0" }, MAC] });
    await repos();
    assert.deepEqual(lues(bloc()).map(({ phrase }) => phrase), ["version 2.5.0 · up to date", "version 2.4.0 · up to date"]);

    statut = undefined;
    const sans = await jouerLaVue({ demarrage: () => demarrage({ a: A, stations: [BOX, MAC] }), espace: () => [] });
    await repos();
    const blocSans = sans.element("accueil-stations").descendants().find(({ className }) => className === "versions-des-stations") ?? assert.fail("pas de versions sans statut");
    assert.deepEqual(lues(blocSans)[1], { nom: "this Mac", phrase: INCONNUE, ton: "gris", survol: INCONNUE_ICI });
  });
});
