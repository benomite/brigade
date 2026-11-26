// Le temps de l'ajout d'un projet à son premier ticket servi, sur sa page (#1401, épique 1393) : le temps qui court
// tant qu'aucun ticket n'est servi, la durée figée que la station publie ensuite. Le délai est relu par `lireSuivi` comme l'app relit le suivi d'une
// station ; la vue est jouée contre le faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Outage } from "../../../src/outages/outages.ts";
import { lireSuivi } from "../../../src/projects/request.ts";
import { calibrationRecommande, EFFORTS, machineProposee, MODELES, type ProjectVu, type VuDesProjects } from "../../../src/projects/projects.ts";
import type { VuDesStations } from "../../../src/stations/stations.ts";
import { dureeEnClair, poserDelay } from "../../../src/vue/project/delay.js";
import { Faux, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const ADDITION = "2026-10-22T10:00:00.000Z";
const SERVED = "2026-10-22T12:34:56.789Z";
const HEURE = 3600_000;

// Ce que l'app relit du suivi d'une station qui publie ce délai.
const relu = (delay: object | undefined) => lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(delay === undefined ? {} : { delai: delay }) }] }))[0]?.delai;

describe("la ligne, posée par le module", () => {
  test("une durée se dit en clair", () => {
    assert.equal(dureeEnClair(30_000), "under a minute");
    assert.equal(dureeEnClair(12 * 60_000), "12 min");
    assert.equal(dureeEnClair(2 * HEURE), "2 h");
    assert.equal(dureeEnClair(2 * HEURE + 34 * 60_000), "2 h 34 min");
    assert.equal(dureeEnClair(76 * HEURE), "3 d 4 h");
  });

  test("aucun ticket servi : le temps court depuis l'ajout, et il avance avec l'horloge", () => {
    const delay = relu({ ajouteLe: ADDITION, serviLe: null, duree: null }) ?? assert.fail("délai illisible");
    const a = poserDelay(doc, { delai: delay, maintenant: Date.parse(ADDITION) + 5 * 60_000 }) ?? assert.fail("pas de ligne");
    assert.equal(a.dataset.delai, "court");
    assert.match(a.textContent ?? "", /^Added 5 min ago, no ticket served yet/);
    const plus = poserDelay(doc, { delai: delay, maintenant: Date.parse(ADDITION) + 3 * HEURE }) ?? assert.fail("pas de ligne");
    assert.match(plus.textContent ?? "", /^Added 3 h ago/);
  });

  test("le premier ticket servi : la durée figée de la station, quelle que soit l'heure qu'il est", () => {
    const delay = relu({ ajouteLe: ADDITION, serviLe: SERVED, duree: Date.parse(SERVED) - Date.parse(ADDITION) }) ?? assert.fail("délai illisible");
    const tot = poserDelay(doc, { delai: delay, maintenant: Date.parse(SERVED) + 1000 }) ?? assert.fail("pas de ligne");
    const tard = poserDelay(doc, { delai: delay, maintenant: Date.parse(SERVED) + 90 * 24 * HEURE }) ?? assert.fail("pas de ligne");
    assert.equal(tot.dataset.delai, "fige");
    assert.match(tot.textContent ?? "", /^First ticket served 2 h 34 min after the project was added/);
    assert.equal(tard.textContent, tot.textContent);
  });

  test("pas de délai publié, ou illisible : pas de ligne", () => {
    assert.equal(poserDelay(doc, { delai: relu(undefined), maintenant: 0 }), null);
    assert.equal(relu({ ajouteLe: "pas une date" }), undefined);
    assert.equal(relu({ ajouteLe: ADDITION, serviLe: SERVED, duree: -5 })?.duree, null, "une durée négative n'est pas figée");
  });
});

describe("sur la page du projet", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const MAC = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0" } as const;
  const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  const vue = (delay: object | undefined): VuDesProjects => {
    const lu = relu(delay);
    const project: ProjectVu = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "en-preparation", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      ...(lu === undefined ? {} : { delai: lu }),
    };
    return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX), g2: machineProposee(MAC) }, calibrage: calibrationRecommande([]) };
  };
  const demarrage = (projectsDesStations: VuDesProjects) => ({
    configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [BOX, MAC] } satisfies VuDesStations,
    accueil: HOME,
    projetsDesStations: projectsDesStations,
  });

  async function laPage(delay: object | undefined) {
    const jouee = await jouerLaVue({ demarrage: () => demarrage(vue(delay)), espace: () => [], autoriserSurGitHub: () => true });
    (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    return { jouee, section: jouee.element("delai-du-projet") };
  }

  test("aucun ticket servi : la ligne du temps qui court", async () => {
    const { section } = await laPage({ ajouteLe: new Date(Date.now() - 20 * 60_000).toISOString(), serviLe: null, duree: null });
    assert.equal(section.hidden, false);
    assert.match(section.dessous("p")[0]?.textContent ?? "", /^Added 2\d min ago, no ticket served yet/);
  });

  test("premier ticket servi : la durée figée", async () => {
    const { section } = await laPage({ ajouteLe: ADDITION, serviLe: SERVED, duree: Date.parse(SERVED) - Date.parse(ADDITION) });
    assert.equal(section.hidden, false);
    assert.match(section.dessous("p")[0]?.textContent ?? "", /^First ticket served 2 h 34 min after the project was added/);
  });

  test("sans délai publié : rien", async () => {
    const { section } = await laPage(undefined);
    assert.equal(section.hidden, true);
  });
});
