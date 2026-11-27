// La part et la médiane de la vue cuisine (#4299) : le process principal les tire des temps que les stations du projet
// publient, et la bande du haut de la vue cuisine les pose — la ligne même de `brigade <project> status`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ENREGISTREMENTS } from "../../../runtime/test/delais/jeu.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { delayOfProject } from "../../src/delays/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { actionsOfCard } from "../../src/card-actions.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { documentOfRequest, FILE_PROJECTS, FILE_TRACKING, type ProjectRequest } from "../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, MODELS, holdProjects, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { Files, GitHubOfStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import type { Terminal } from "../../src/terminals.ts";
import { type Played, playTheVue, repos } from "../helpers/false-vue.ts";

const NOW = Date.parse("2026-11-25T12:00:00.000Z");
const LINE = "taken-to-merged 24 h: 50% in 10 min or less (1 of 2), median 16.5 min";
const BOX: StationVue = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const PARADE: ProjectRequest = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null };

test("the published ticket times give the same line as `status`", () => {
  assert.equal(delayOfProject({ enregistrements: ENREGISTREMENTS }, new Date(NOW)), LINE);
  assert.equal(delayOfProject({ enregistrements: [] }, new Date(NOW)), "taken-to-merged 24 h: no merged ticket in the last 24 h");
});

async function read(time: object | undefined): Promise<ProjectSeen | undefined> {
  const tracking = { nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: null, cuitSur: BOX.nom, ici: false, bascule: null, ...(time === undefined ? {} : { temps: time }) };
  const gists = new Map<string, Files>([[BOX.id, { [FILE_PROJECTS]: documentOfRequest([PARADE]), [FILE_TRACKING]: JSON.stringify({ brigade: "projets-suivi", format: 1, a: new Date(NOW).toISOString(), projets: [tracking] }) }]]);
  const github: GitHubOfStations = { lister: async () => [], lire: async (id) => gists.get(id) ?? null, ecrire: async () => {}, supprimer: async () => {} };
  const seenOne = await holdProjects({ github, stations: () => [BOX], depots: async () => [], surLecture: () => {}, maintenant: () => NOW, locale: () => null }).relire();
  return seenOne.projets.find(({ nom: name }) => name === "parade");
}

test("the main process reads the line from the times a station publishes; without published times, no line", async () => {
  assert.equal((await read({ enregistrements: ENREGISTREMENTS, lostTimeMaxMin: 2 }))?.delaiDePrise, LINE);
  const without = await read(undefined);
  assert.notEqual(without, undefined);
  assert.equal(without?.delaiDePrise, undefined);
});

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const A = "2026-11-25T12:00:00.000Z";
const projectsOfStations = (project: Partial<ProjectSeen>): SeenOfProjects => ({
  a: A,
  projets: [{ nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: "servi", dit: "", autoriser: [] }], servi: null, ...project }],
  recommandee: "g1",
  avertissements: {},
  machines: {},
  calibrage: calibrationRecommended([]),
});

async function kitchen(project: Partial<ProjectSeen>): Promise<Played> {
  const startup = () => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
    gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
    banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined,
    projetsDesStations: projectsOfStations(project),
  });
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsOfCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const facts: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], rail: [] };
  const receivedOne = holdFacts().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const bandOfTop = (vue: Played) => vue.element("rail").children.find(({ className }) => className === "bande-du-haut") ?? assert.fail("pas de bande du haut");

test("the top band of the kitchen view shows the share and the median, at the end of the supervisor and closer cards' line (#4354)", async () => {
  const [line] = bandOfTop(await kitchen({ delaiDePrise: LINE })).children;
  const ends = (line ?? assert.fail("pas de ligne")).children.map(({ className, textContent }) => [className, textContent]);
  assert.deepEqual(ends.at(-1), ["ligne-du-delai", LINE]);
  assert.match(ends.map(([, text]) => text).join("\n"), /supervisor[\s\S]*closer[\s\S]*50% in 10 min or less[\s\S]*median 16\.5 min/);
});

test("without published times the band has no such line", async () => {
  const classes = bandOfTop(await kitchen({})).descendants().map(({ className }) => className);
  assert.equal(classes.includes("ligne-du-delai"), false);
});
