// Sur l'onglet Stations, une carte par station qui sert le projet, chacune une fois (#1786, #3195) : celles que `facts`
// donne, rattachées à la station appairée qui porte leur nom. Une station appairée qui ne sert pas le projet n'en a pas.
// Chacune dit son état — vert seulement en ligne, et jamais pour une station que la cuisine ne voit pas (#1830) — et ce
// qu'elle cuit. La vue jouée telle qu'elle est,
// devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Facts as FactsOfRuntime } from "../../src/facts.ts"; // the app's own Facts (the old runtime's etat.ts is gone)
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { type Fake, type Played, playTheVue, openTab, repos } from "../helpers/false-vue.ts";

const A = "2026-10-27T10:04:12.000Z";
const PARADE = "parade";

// Les stations appairées du compte : la box, qui sert parade, ce Mac et un PC.
const pairedOne = (id: string, name: string, projects: string[] = []) => ({ id, nom: name, machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: projects, max: null }) as const;
const BOX = pairedOne("gbox", "box", [PARADE]);
const MAC = pairedOne("gmac", "macbook");
const PC = pairedOne("gpc", "pc");
const STATIONS: SeenOfStations = { a: A, stations: [BOX, MAC, PC] };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };

// parade cuit sur la box ; l'app lui a ajouté ce Mac, que la box dit atteint, et le PC, qui n'a pas encore lu la demande.
const ON_THE_BOX: ProjectSeen = {
  nom: PARADE,
  depot: "benomite/parade",
  base: "main",
  suiviPar: { id: "gbox", nom: "box" },
  stations: [
    { id: "gbox", nom: "box", etat: "servi", dit: "served by box", autoriser: [] },
    { id: "gmac", nom: "macbook", etat: "servi", dit: "it is online on GitHub", autoriser: [] },
    { id: "gpc", nom: "pc", etat: "attendu", dit: "pc has not read it yet", autoriser: [] },
  ],
  servi: null,
  cuitSur: { id: "gbox", nom: "box", ici: false },
  demenagement: null,
};
const seenOf = (...projects: ProjectSeen[]): SeenOfProjects => ({ a: A, projets: projects, locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposed(BOX), gmac: machineProposed(MAC), gpc: machineProposed(PC) }, calibrage: calibrationRecommended([]) });

type OfRuntime = NonNullable<FactsOfRuntime["stations"]>[number];
const station = (name: string, more: Partial<OfRuntime> = {}): OfRuntime => ({ station: name, distante: false, plafond: 3, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [], ...more });
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
// `facts` de la box : elle seule s'y est annoncée — le Mac, déclaré, ne l'a pas encore fait.
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-27T10:04:11.000Z",
  dernierTick: "2026-10-27T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/benomite/parade/issues/14", activite: null }],
  cooks: [COOK_14],
  attend: [],
};
const STATIONS_OF_FACTS = [station("box/claude", { cooks: [COOK_14] })];

const PROJECT: Project = { nom: PARADE, dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const startup = (seenOne: SeenOfProjects) => () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PROJECT] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: HOME,
  projetsDesStations: seenOne,
});

async function open(
  seenOne: SeenOfProjects = seenOf(ON_THE_BOX),
  stations: OfRuntime[] = STATIONS_OF_FACTS,
): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup(seenOne), espace: () => [], defautsDeStation: () => ({ refus: "pas ici" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations }) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await openTab(vue, "Stations");
  return vue;
}

// Les cartes de l'onglet, par leur clé (le gist de la station appairée, sinon son nom), et leur état.
const lines = (vue: Played) => vue.element("rail").dessous("section").filter((pose) => pose.className === "carte-de-station");
const line = (vue: Played, key: string) => lines(vue).find((pose) => pose.dataset.station === key) ?? assert.fail(`pas de carte pour ${key}`);
const pill = (pose: Fake) => pose.dessous("span").find(({ className }) => className === "pilule etat");
const stateOf = (pose: Fake) => [pill(pose)?.dessous("strong")[0]?.textContent, pill(pose)?.dataset.ton];

describe("une carte par station qui sert le projet, chacune une fois (#1786, #3195)", () => {
  test("celle de `facts`, rattachée à sa station appairée ; pas celle qui ne le sert pas", async () => {
    const vue = await open();
    assert.deepEqual(lines(vue).map(({ dataset }) => dataset.station), ["gbox"]);
    // La box est en ligne, et cuit #14. Le Mac et le PC, ajoutés par l'app mais qui ne se sont pas annoncés dans `facts`,
    // n'ont pas de carte : l'app ne lit plus les stations que le projet déclare.
    assert.deepEqual(lines(vue).map(stateOf), [["online", "vert"]]);
    assert.match(line(vue, "gbox").textContent, /#14/);
    const tab = vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet");
    assert.doesNotMatch(tab.textContent, /\bpc\b|what each station provides|not received by the station|check again/);
  });

  test("le Mac s'annonce dans `facts` : il a toujours une seule carte, la sienne, et il est en ligne", async () => {
    const vue = await open();
    const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: [...STATIONS_OF_FACTS, station("macbook/claude", { distante: true })] }) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(lines(vue).map(({ dataset }) => dataset.station), ["gmac", "gbox"]);
    assert.deepEqual(stateOf(line(vue, "gmac")), ["online", "vert"]);
  });

  test("toutes les cartes se disent de la même façon : aucun geste de la cuisine, ni « move the kitchen »", async () => {
    const vue = await open();
    assert.equal(vue.element("rail").dessous("button").some(({ textContent }) => textContent === "move the kitchen"), false);
    const shapes = lines(vue).map((pose) => pose.children.map(({ balise, className }) => className || balise).slice(0, 2));
    assert.deepEqual(shapes, shapes.map(() => ["header", "ce-qu-elle-est"]));
  });
});

describe("chaque carte dit sa station telle que `facts` la voit (#1830)", () => {
  // mirrorscreen : la cuisine lit le Mac mais il ne s'est jamais manifesté à elle ; l'app, elle, le lit en ligne sur GitHub.
  const THE_BOX = station("box/claude", { cooks: [COOK_14], fournit: ["code", "raisonnement"], presente: true, vueLe: null });
  const THE_MAC = station("macbook/claude", { distante: true, fournit: ["code", "raisonnement", "navigateur-headless", "macos"], presente: false, vueLe: null });

  test("que la box ne voit pas, le Mac ne cuit pas — jamais vert, même en ligne sur GitHub ; la box, elle, est en ligne", async () => {
    const vue = await open(seenOf(ON_THE_BOX), [THE_BOX, THE_MAC]);
    assert.deepEqual(stateOf(line(vue, "gmac")), ["not seen by the kitchen", "rouge"]);
    assert.deepEqual(stateOf(line(vue, "gbox")), ["online", "vert"]);
  });

  test("le Mac se manifeste à la box : il est en ligne ; tu depuis, il le redit, et depuis quand", async () => {
    const vue = await open(seenOf(ON_THE_BOX), [THE_BOX, { ...THE_MAC, presente: true, vueLe: "2026-10-27T10:03:00.000Z" }]);
    assert.deepEqual(stateOf(line(vue, "gmac")), ["online", "vert"]);
    const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: [THE_BOX, { ...THE_MAC, vueLe: "2026-10-27T10:03:00.000Z" }] }) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(stateOf(line(vue, "gmac")), ["not seen by the kitchen for 1 min", "rouge"]);
  });
});
