// La part et la médiane de la vue cuisine (#4299) : le process principal les tire des temps que les stations du projet
// publient, et la bande du haut de la vue cuisine les pose — la ligne même de `brigade <project> status`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ENREGISTREMENTS } from "../../../runtime/test/delais/jeu.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { delayDuProject } from "../../src/delays/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../src/facts.ts";
import { actionsDeCard } from "../../src/card-actions.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { documentDeRequest, FICHIER_PROJECTS, FICHIER_SUIVI, type ProjectRequest } from "../../src/projects/request.ts";
import { calibrationRecommande, EFFORTS, MODELES, holdProjects, type ProjectVu, type VuDesProjects } from "../../src/projects/projects.ts";
import type { Fichiers, GitHubDesStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const MAINTENANT = Date.parse("2026-11-25T12:00:00.000Z");
const LINE = "taken-to-merged 24 h: 50% in 10 min or less (1 of 2), median 16.5 min";
const BOX: StationVue = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const PARADE: ProjectRequest = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null };

test("the published ticket times give the same line as `status`", () => {
  assert.equal(delayDuProject({ enregistrements: ENREGISTREMENTS }, new Date(MAINTENANT)), LINE);
  assert.equal(delayDuProject({ enregistrements: [] }, new Date(MAINTENANT)), "taken-to-merged 24 h: no merged ticket in the last 24 h");
});

async function lire(time: object | undefined): Promise<ProjectVu | undefined> {
  const suivi = { nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: null, cuitSur: BOX.nom, ici: false, bascule: null, ...(time === undefined ? {} : { temps: time }) };
  const gists = new Map<string, Fichiers>([[BOX.id, { [FICHIER_PROJECTS]: documentDeRequest([PARADE]), [FICHIER_SUIVI]: JSON.stringify({ brigade: "projets-suivi", format: 1, a: new Date(MAINTENANT).toISOString(), projets: [suivi] }) }]]);
  const github: GitHubDesStations = { lister: async () => [], lire: async (id) => gists.get(id) ?? null, ecrire: async () => {}, supprimer: async () => {} };
  const vu = await holdProjects({ github, stations: () => [BOX], depots: async () => [], surLecture: () => {}, maintenant: () => MAINTENANT, locale: () => null }).relire();
  return vu.projets.find(({ nom: name }) => name === "parade");
}

test("the main process reads the line from the times a station publishes; without published times, no line", async () => {
  assert.equal((await lire({ enregistrements: ENREGISTREMENTS, lostTimeMaxMin: 2 }))?.delaiDePrise, LINE);
  const sans = await lire(undefined);
  assert.notEqual(sans, undefined);
  assert.equal(sans?.delaiDePrise, undefined);
});

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const A = "2026-11-25T12:00:00.000Z";
const projectsDesStations = (project: Partial<ProjectVu>): VuDesProjects => ({
  a: A,
  projets: [{ nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: "servi", dit: "", autoriser: [] }], servi: null, ...project }],
  recommandee: "g1",
  avertissements: {},
  machines: {},
  calibrage: calibrationRecommande([]),
});

async function kitchen(project: Partial<ProjectVu>): Promise<Jouee> {
  const demarrage = () => ({
    configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
    projetsDesStations: projectsDesStations(project),
  });
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsDeCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const facts: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], rail: [] };
  const recue = holdFacts().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const bandeDuHaut = (vue: Jouee) => vue.element("rail").children.find(({ className }) => className === "bande-du-haut") ?? assert.fail("pas de bande du haut");

test("the top band of the kitchen view shows the share and the median, at the end of the supervisor and closer cards' line (#4354)", async () => {
  const [line] = bandeDuHaut(await kitchen({ delaiDePrise: LINE })).children;
  const bouts = (line ?? assert.fail("pas de ligne")).children.map(({ className, textContent }) => [className, textContent]);
  assert.deepEqual(bouts.at(-1), ["ligne-du-delai", LINE]);
  assert.match(bouts.map(([, texte]) => texte).join("\n"), /supervisor[\s\S]*closer[\s\S]*50% in 10 min or less[\s\S]*median 16\.5 min/);
});

test("without published times the band has no such line", async () => {
  const classes = bandeDuHaut(await kitchen({})).descendants().map(({ className }) => className);
  assert.equal(classes.includes("ligne-du-delai"), false);
});
