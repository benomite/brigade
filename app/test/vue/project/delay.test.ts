// Le temps de l'ajout d'un projet à son premier ticket servi, sur sa page (#1401, épique 1393) : le temps qui court
// tant qu'aucun ticket n'est servi, la durée figée que la station publie ensuite. Le délai est relu par `lireSuivi` comme l'app relit le suivi d'une
// station ; la vue est jouée contre le faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";

import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { readTracking } from "../../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../../src/projects/projects.ts";
import type { SeenOfStations } from "../../../src/stations/stations.ts";
import { durationInClear, setDelay } from "../../../src/vue/project/delay.js";
import { Fake, playTheVue, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const ADDITION = "2026-10-22T10:00:00.000Z";
const SERVED = "2026-10-22T12:34:56.789Z";
const HOUR = 3600_000;

// Ce que l'app relit du suivi d'une station qui publie ce délai.
const reread = (delay: object | undefined) => readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(delay === undefined ? {} : { delai: delay }) }] }))[0]?.delai;

describe("la ligne, posée par le module", () => {
  test("une durée se dit en clair", () => {
    assert.equal(durationInClear(30_000), "under a minute");
    assert.equal(durationInClear(12 * 60_000), "12 min");
    assert.equal(durationInClear(2 * HOUR), "2 h");
    assert.equal(durationInClear(2 * HOUR + 34 * 60_000), "2 h 34 min");
    assert.equal(durationInClear(76 * HOUR), "3 d 4 h");
  });

  test("aucun ticket servi : le temps court depuis l'ajout, et il avance avec l'horloge", () => {
    const delay = reread({ ajouteLe: ADDITION, serviLe: null, duree: null }) ?? assert.fail("délai illisible");
    const a = setDelay(doc, { delai: delay, maintenant: Date.parse(ADDITION) + 5 * 60_000 }) ?? assert.fail("pas de ligne");
    assert.equal(a.dataset.delai, "court");
    assert.match(a.textContent ?? "", /^Added 5 min ago, no ticket served yet/);
    const more = setDelay(doc, { delai: delay, maintenant: Date.parse(ADDITION) + 3 * HOUR }) ?? assert.fail("pas de ligne");
    assert.match(more.textContent ?? "", /^Added 3 h ago/);
  });

  test("le premier ticket servi : la durée figée de la station, quelle que soit l'heure qu'il est", () => {
    const delay = reread({ ajouteLe: ADDITION, serviLe: SERVED, duree: Date.parse(SERVED) - Date.parse(ADDITION) }) ?? assert.fail("délai illisible");
    const early = setDelay(doc, { delai: delay, maintenant: Date.parse(SERVED) + 1000 }) ?? assert.fail("pas de ligne");
    const late = setDelay(doc, { delai: delay, maintenant: Date.parse(SERVED) + 90 * 24 * HOUR }) ?? assert.fail("pas de ligne");
    assert.equal(early.dataset.delai, "fige");
    assert.match(early.textContent ?? "", /^First ticket served 2 h 34 min after the project was added/);
    assert.equal(late.textContent, early.textContent);
  });

  test("pas de délai publié, ou illisible : pas de ligne", () => {
    assert.equal(setDelay(doc, { delai: reread(undefined), maintenant: 0 }), null);
    assert.equal(reread({ ajouteLe: "pas une date" }), undefined);
    assert.equal(reread({ ajouteLe: ADDITION, serviLe: SERVED, duree: -5 })?.duree, null, "une durée négative n'est pas figée");
  });
});

describe("sur la page du projet", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const MAC = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0" } as const;
  const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  const vue = (delay: object | undefined): SeenOfProjects => {
    const readOne = reread(delay);
    const project: ProjectSeen = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "en-preparation", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      ...(readOne === undefined ? {} : { delai: readOne }),
    };
    return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX), g2: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };
  };
  const startup = (projectsOfStations: SeenOfProjects) => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: {},
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    stations: { a: A, stations: [BOX, MAC] } satisfies SeenOfStations,
    accueil: HOME,
    projetsDesStations: projectsOfStations,
  });

  async function thePage(delay: object | undefined) {
    const played = await playTheVue({ demarrage: () => startup(vue(delay)), espace: () => [], autoriserSurGitHub: () => true });
    (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    return { jouee: played, section: played.element("delai-du-projet") };
  }

  test("aucun ticket servi : la ligne du temps qui court", async () => {
    const { section } = await thePage({ ajouteLe: new Date(Date.now() - 20 * 60_000).toISOString(), serviLe: null, duree: null });
    assert.equal(section.hidden, false);
    assert.match(section.dessous("p")[0]?.textContent ?? "", /^Added 2\d min ago, no ticket served yet/);
  });

  test("premier ticket servi : la durée figée", async () => {
    const { section } = await thePage({ ajouteLe: ADDITION, serviLe: SERVED, duree: Date.parse(SERVED) - Date.parse(ADDITION) });
    assert.equal(section.hidden, false);
    assert.match(section.dessous("p")[0]?.textContent ?? "", /^First ticket served 2 h 34 min after the project was added/);
  });

  test("sans délai publié : rien", async () => {
    const { section } = await thePage(undefined);
    assert.equal(section.hidden, true);
  });
});
