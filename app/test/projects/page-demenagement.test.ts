// Ce que la page d'un projet dit de l'endroit où il cuit, la vue jouée (#1095, #3523). Rail n'a plus de ligne « Cooks on … »
// ni de bouton « move the kitchen » ni de « + station » (#3523) : la station et son état sont une étiquette à côté de
// l'onglet Stations, et le déménagement, l'ajout d'une station se font dans cet onglet (test/stations-tab/). Ne reste sur
// Rail que ce qui est en route : un déménagement qui part, ou la raison d'un refus.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { calibrationRecommande, EFFORTS, machineProposee, MODELES, type Demenagement, type ProjectVu, type VuDesProjects } from "../../src/projects/projects.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-20T10:00:00.000Z";
const BOX = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const MAC = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC] };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

// parade, confié à ses deux stations, et où il cuit, tel que leurs suivis le disent.
const station = (id: string, name: string, state: "servi" | "refuse" | "attendu" | "a-autoriser" = "servi", dit = "") => ({ id, nom: name, etat: state, dit, autoriser: [] });
const SUR_LA_BOX: ProjectVu = { nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [station("gbox", "parade-box"), station("gmac", "macbook")], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const SUR_LE_MAC: ProjectVu = { ...SUR_LA_BOX, suiviPar: { id: "gmac", nom: "macbook" }, stations: [station("gmac", "macbook"), station("gbox", "parade-box")], cuitSur: { id: "gmac", nom: "macbook", ici: true } };
const vuDes = (...projects: ProjectVu[]): VuDesProjects => ({ a: A, projets: projects, locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC) }, calibrage: calibrationRecommande([]) });

const demarrage = (projects: Project[], projectsDesStations: VuDesProjects, stations: VuDesStations = STATIONS) => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: projects }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations,
  accueil: HOME,
  projetsDesStations: projectsDesStations,
});

// Ce qui se voit sous `ou` : ni lui, ni aucun de ses parents jusqu'à `ou` n'est caché.
const montre = (ou: Faux, element: Faux) => {
  for (let pose: Faux | null = element; pose !== null && pose !== ou; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const boutons = (ou: Faux) => ou.dessous("button").filter((button) => montre(ou, button));
const button = (ou: Faux, texte: string) => boutons(ou).find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » visible sous ${ou.id}`);
const line = (bloc: Faux) => bloc.children[0] ?? assert.fail("pas de ligne");
const choice = (bloc: Faux) => bloc.dessous("section").find((section) => section.className === "demenagement") ?? assert.fail("pas de choix du déménagement");
const dit = (bloc: Faux) => bloc.dessous("p").find((p) => p.className.split(" ").includes("demenagement-dit")) ?? assert.fail("pas de ligne de déménagement");

// L'espace de « parade », ouvert par sa case de la barre.
async function laPage(vu: VuDesProjects, demenager: (name: string, vers: string) => Demenagement = () => ({ demenage: { projet: "parade", de: "parade-box", vers: "macbook" } }), project: Project = PARADE, stations: VuDesStations = STATIONS) {
  const jouee = await jouerLaVue({ demarrage: () => demarrage([project], vu, stations), demenagerLaCuisine: demenager, espace: () => [] });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(jouee.element("espace").textContent, "parade");
  return { jouee, bloc: jouee.element("stations-du-projet") };
}

// Les stations, telles qu'elles disent servir parade — ce que l'onglet Stations lit pour dire qui le cuit.
const SERVED_PAR_LA_BOX: VuDesStations = { a: A, stations: [{ ...BOX, projets: ["parade"] }, MAC] };
const SERVED_PAR_LE_MAC: VuDesStations = { a: A, stations: [BOX, { ...MAC, projets: ["parade"] }] };
const etiquette = (jouee: Awaited<ReturnType<typeof laPage>>["jouee"]) => jouee.element("etiquette-de-station");
const sansButton = (bloc: Faux) => (bloc.hidden ? [] : boutons(bloc)).filter(({ textContent }) => ["move the kitchen", "+ station"].includes(textContent));

test("un projet qui cuit sur sa box : rien au-dessus des colonnes, la station et son état à côté de l'onglet Stations", async () => {
  const { jouee, bloc } = await laPage(vuDes(SUR_LA_BOX), undefined, PARADE, SERVED_PAR_LA_BOX);
  assert.equal(montre(jouee.element("rail"), bloc) && !bloc.hidden, false, "la ligne des stations est partie de Rail");
  assert.equal(sansButton(bloc).length, 0);
  assert.doesNotMatch(bloc.textContent, /Cooks on|stops when you close the app/);
  assert.equal(etiquette(jouee).hidden, false);
  assert.equal(etiquette(jouee).textContent, "parade-box · cooking");
  assert.doesNotMatch(etiquette(jouee).title, /stops when you close the app/);
});

test("un projet qui cuit sur ce Mac : l'étiquette le dit, et sa cuisine s'arrête quand on ferme l'app — au survol, jamais d'une autre station", async () => {
  const { jouee, bloc } = await laPage(vuDes(SUR_LE_MAC), undefined, PARADE, SERVED_PAR_LE_MAC);
  assert.equal(bloc.hidden, true);
  assert.match(etiquette(jouee).textContent, /^macbook.* · cooking$/);
  assert.match(etiquette(jouee).title, /its kitchen stops when you close the app/);
});

test("un déménagement en route : sa ligne reste sur Rail, sans le bouton qui le demande", async () => {
  const enRoute: ProjectVu = { ...SUR_LA_BOX, demenagement: { de: "parade-box", vers: "macbook", demandeLe: A, etape: "acceptee", dit: "ready to take it over from parade-box" } };
  const { jouee, bloc } = await laPage(vuDes(enRoute));
  assert.equal(bloc.hidden, false);
  assert.match(line(bloc).textContent, /^ · moving to macbook…/);
  assert.equal(sansButton(bloc).length, 0);
  assert.match(etiquette(jouee).textContent, /^moving to macbook$/);
});

test("refusé par ce Mac après coup : la raison reste dite sur Rail, en une phrase, sans bouton ; le déménagement se reprend dans l'onglet Stations", async () => {
  const raison = "la configuration du bac à sable ne tient pas sur ce Mac — sandbox-exec is missing";
  const refuse: ProjectVu = {
    ...SUR_LA_BOX,
    suiviPar: { id: "gmac", nom: "macbook" },
    stations: [station("gmac", "macbook", "refuse", raison), station("gbox", "parade-box")],
    demenagement: { de: "parade-box", vers: "macbook", demandeLe: A, etape: "refusee", dit: raison },
  };
  const { bloc } = await laPage(vuDes(refuse));
  assert.equal(bloc.hidden, false);
  assert.equal(dit(bloc).textContent, `parade stays on parade-box: macbook refused to take it over — ${raison}`);
  assert.equal(sansButton(bloc).length, 0);
});
