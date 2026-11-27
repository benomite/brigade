// Ce que la page d'un projet dit de l'endroit où il cuit, la vue jouée (#1095, #3523). Rail n'a plus de ligne « Cooks on … »
// ni de bouton « move the kitchen » ni de « + station » (#3523) : la station et son état sont une étiquette à côté de
// l'onglet Stations, et le déménagement, l'ajout d'une station se font dans cet onglet (test/stations-tab/). Ne reste sur
// Rail que ce qui est en route : un déménagement qui part, ou la raison d'un refus.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type Move, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { type Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const A = "2026-10-20T10:00:00.000Z";
const BOX = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const MAC = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: SeenOfStations = { a: A, stations: [BOX, MAC] };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// parade, confié à ses deux stations, et où il cuit, tel que leurs suivis le disent.
const station = (id: string, name: string, state: "servi" | "refuse" | "attendu" | "a-autoriser" = "servi", said = "") => ({ id, nom: name, etat: state, dit: said, autoriser: [] });
const ON_THE_BOX: ProjectSeen = { nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [station("gbox", "parade-box"), station("gmac", "macbook")], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const ON_THE_MAC: ProjectSeen = { ...ON_THE_BOX, suiviPar: { id: "gmac", nom: "macbook" }, stations: [station("gmac", "macbook"), station("gbox", "parade-box")], cuitSur: { id: "gmac", nom: "macbook", ici: true } };
const seenOf = (...projects: ProjectSeen[]): SeenOfProjects => ({ a: A, projets: projects, locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposed(BOX), gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) });

const startup = (projects: Project[], projectsOfStations: SeenOfProjects, stations: SeenOfStations = STATIONS) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations,
  accueil: HOME,
  projetsDesStations: projectsOfStations,
});

// Ce qui se voit sous `ou` : ni lui, ni aucun de ses parents jusqu'à `ou` n'est caché.
const shows = (or: Fake, element: Fake) => {
  for (let pose: Fake | null = element; pose !== null && pose !== or; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const buttons = (or: Fake) => or.dessous("button").filter((button) => shows(or, button));
const button = (or: Fake, text: string) => buttons(or).find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » visible sous ${or.id}`);
const line = (block: Fake) => block.children[0] ?? assert.fail("pas de ligne");
const choice = (block: Fake) => block.dessous("section").find((section) => section.className === "demenagement") ?? assert.fail("pas de choix du déménagement");
const said = (block: Fake) => block.dessous("p").find((p) => p.className.split(" ").includes("demenagement-dit")) ?? assert.fail("pas de ligne de déménagement");

// L'espace de « parade », ouvert par sa case de la barre.
async function thePage(seenOne: SeenOfProjects, relocate: (name: string, to: string) => Move = () => ({ demenage: { projet: "parade", de: "parade-box", vers: "macbook" } }), project: Project = PARADE, stations: SeenOfStations = STATIONS) {
  const played = await playTheVue({ demarrage: () => startup([project], seenOne, stations), demenagerLaCuisine: relocate, espace: () => [] });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(played.element("espace").textContent, "parade");
  return { jouee: played, bloc: played.element("stations-du-projet") };
}

// Les stations, telles qu'elles disent servir parade — ce que l'onglet Stations lit pour dire qui le cuit.
const SERVED_PAR_THE_BOX: SeenOfStations = { a: A, stations: [{ ...BOX, projets: ["parade"] }, MAC] };
const SERVED_PAR_THE_MAC: SeenOfStations = { a: A, stations: [BOX, { ...MAC, projets: ["parade"] }] };
const label = (played: Awaited<ReturnType<typeof thePage>>["jouee"]) => played.element("etiquette-de-station");
const withoutButton = (block: Fake) => (block.hidden ? [] : buttons(block)).filter(({ textContent }) => ["move the kitchen", "+ station"].includes(textContent));

test("un projet qui cuit sur sa box : rien au-dessus des colonnes, la station et son état à côté de l'onglet Stations", async () => {
  const { jouee: played, bloc: block } = await thePage(seenOf(ON_THE_BOX), undefined, PARADE, SERVED_PAR_THE_BOX);
  assert.equal(shows(played.element("rail"), block) && !block.hidden, false, "la ligne des stations est partie de Rail");
  assert.equal(withoutButton(block).length, 0);
  assert.doesNotMatch(block.textContent, /Cooks on|stops when you close the app/);
  assert.equal(label(played).hidden, false);
  assert.equal(label(played).textContent, "parade-box · cooking");
  assert.doesNotMatch(label(played).title, /stops when you close the app/);
});

test("un projet qui cuit sur ce Mac : l'étiquette le dit, et sa cuisine s'arrête quand on ferme l'app — au survol, jamais d'une autre station", async () => {
  const { jouee: played, bloc: block } = await thePage(seenOf(ON_THE_MAC), undefined, PARADE, SERVED_PAR_THE_MAC);
  assert.equal(block.hidden, true);
  assert.match(label(played).textContent, /^macbook.* · cooking$/);
  assert.match(label(played).title, /its kitchen stops when you close the app/);
});

test("un déménagement en route : sa ligne reste sur Rail, sans le bouton qui le demande", async () => {
  const enRoute: ProjectSeen = { ...ON_THE_BOX, demenagement: { de: "parade-box", vers: "macbook", demandeLe: A, etape: "acceptee", dit: "ready to take it over from parade-box" } };
  const { jouee: played, bloc: block } = await thePage(seenOf(enRoute));
  assert.equal(block.hidden, false);
  assert.match(line(block).textContent, /^ · moving to macbook…/);
  assert.equal(withoutButton(block).length, 0);
  assert.match(label(played).textContent, /^moving to macbook$/);
});

test("refusé par ce Mac après coup : la raison reste dite sur Rail, en une phrase, sans bouton ; le déménagement se reprend dans l'onglet Stations", async () => {
  const reason = "la configuration du bac à sable ne tient pas sur ce Mac — sandbox-exec is missing";
  const refuses: ProjectSeen = {
    ...ON_THE_BOX,
    suiviPar: { id: "gmac", nom: "macbook" },
    stations: [station("gmac", "macbook", "refuse", reason), station("gbox", "parade-box")],
    demenagement: { de: "parade-box", vers: "macbook", demandeLe: A, etape: "refusee", dit: reason },
  };
  const { bloc: block } = await thePage(seenOf(refuses));
  assert.equal(block.hidden, false);
  assert.equal(said(block).textContent, `parade stays on parade-box: macbook refused to take it over — ${reason}`);
  assert.equal(withoutButton(block).length, 0);
});
