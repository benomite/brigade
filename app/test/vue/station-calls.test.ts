// Les appels de la box à GitHub sur la page de sa station (#1418, épique 1415) : le runtime les publie dans `faits`
// (`appelsGithub`), l'app les lit (`comprendre`), les range sous la station qui les a rendus (`tenirAccueil`), et la
// page les montre — ou un tiret neutre quand le runtime est d'avant ce champ.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home, LineOfStation } from "../../src/home.ts";
import { holdHome } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, understand, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { setTheCalls } from "../../src/vue/calls-of-the-station.js";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { Fake, playTheVue, openAllTheStations, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const CALLS = { total: 42, topProject: { name: "parade", calls: 30 }, topKind: { name: "issues", calls: 25 } };
const A = "2026-10-22T12:00:00.000Z";

// Les faits minimaux qu'un runtime publie, avec ou sans le compteur.
const factsJson = (more: object) =>
  JSON.stringify({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], ...more });

describe("la lecture des faits", () => {
  test("les appels publiés sont lus tels quels", () => {
    const understood = understand(factsJson({ appelsGithub: { ...CALLS, byProject: [], byKind: [] } })) as Facts;
    assert.deepEqual(understood.appelsGithub, CALLS);
  });

  test("zéro appel : un total nul et personne en tête", () => {
    const understood = understand(factsJson({ appelsGithub: { total: 0, topProject: null, topKind: null } })) as Facts;
    assert.deepEqual(understood.appelsGithub, { total: 0, topProject: null, topKind: null });
  });

  test("un runtime d'avant le champ : les faits restent lus, sans appels", () => {
    const understood = understand(factsJson({})) as Facts;
    assert.equal("appelsGithub" in understood, false);
  });
});

describe("l'accueil range les appels sous la station qui les rend", () => {
  const STATION: StationVue = { id: "g1", nom: "box", machine: "Linux", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: null };
  const read = (callsGithub: object | undefined) => {
    const home = holdHome({ projets: () => [{ nom: "parade", servi: true }], maintenant: () => Date.parse(A) });
    home.stations({ a: A, stations: [STATION] });
    home.faits({ projet: "parade", demande: 1, a: A, sorties: [{ commande: "facts", texte: factsJson(callsGithub === undefined ? {} : { appelsGithub: callsGithub }) }] });
    home.status({ projet: "parade", demande: 1, a: A, attend: undefined, sorties: [{ commande: "status", texte: "head\n\ncooks      none running — box: 3 at most — 8 cores\n" }] });
    return home.vu().stations?.[0] as LineOfStation;
  };

  test("avec le compteur : la ligne de la station le porte", () => {
    assert.deepEqual(read(CALLS).appels, CALLS);
  });

  test("sans le compteur : rien", () => {
    assert.equal(read(undefined).appels, undefined);
  });
});

describe("la ligne posée par le module", () => {
  test("le total et ce qui en a fait le plus", () => {
    const line = setTheCalls(doc, CALLS);
    assert.equal(line.dataset.appels, "lus");
    assert.match(line.textContent ?? "", /GitHub calls, last hour: 42 — most from parade \(30\), mostly issues \(25\)/);
  });

  test("zéro appel : le total seul", () => {
    const line = setTheCalls(doc, { total: 0, topProject: null, topKind: null });
    assert.match(line.textContent ?? "", /GitHub calls, last hour: 0$/);
  });

  test("absents : un tiret neutre, et son survol", () => {
    const line = setTheCalls(doc, undefined);
    assert.equal(line.dataset.appels, "absents");
    assert.match(line.textContent ?? "", /GitHub calls, last hour: —/);
    assert.ok(line.dessous("button").length > 0, "le survol dit pourquoi");
  });
});

describe("sur la page de la station", () => {
  const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  async function thePage(calls: LineOfStation["appels"]) {
    const line: LineOfStation = { id: "g1", nom: "box", ton: "vert", dit: "online", phrase: "online", survol: "", ...(calls === undefined ? {} : { appels: calls }) };
    const home: Home = { projets: [], stations: [line], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
    const startup = () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [BOX] } satisfies SeenOfStations,
      accueil: home,
      projetsDesStations: undefined,
    });
    const played = await playTheVue({ demarrage: startup as never, espace: () => [], autoriserSurGitHub: () => true });
    await openAllTheStations(played);
    (played.element("toutes-les-stations").dessous("button")[0] ?? assert.fail("pas de ligne de station")).click();
    await repos();
    return played.element("station");
  }

  test("les appels de l'heure et le plus gros consommateur sont sur la page", async () => {
    const page = await thePage(CALLS);
    const line = page.dessous("p").find((p) => p.className === "appels-de-la-station") ?? assert.fail("pas de ligne d'appels");
    assert.match(line.textContent ?? "", /GitHub calls, last hour: 42 — most from parade \(30\), mostly issues \(25\)/);
  });

  test("sans chiffres : la page se dessine et la ligne dit un tiret", async () => {
    const page = await thePage(undefined);
    const line = page.dessous("p").find((p) => p.className === "appels-de-la-station") ?? assert.fail("pas de ligne d'appels");
    assert.match(line.textContent ?? "", /GitHub calls, last hour: —/);
  });
});
