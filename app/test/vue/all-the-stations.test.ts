// Sur l'onglet Stations, une carte par station qui sert le projet, chacune une fois (#1786, #3195) : celles que `facts`
// donne — rattachées à la station appairée qui porte leur nom —, et celles que la principale déclare sans qu'elles s'y
// soient annoncées. Une station appairée qui ne sert pas le projet n'en a pas. Chacune dit son état — vert seulement en
// ligne, et jamais pour une station que la cuisine ne voit pas (#1830) —, ce qu'elle cuit, et, dans « Details », ses cooks à
// la fois — une rangée de réglage, dont le champ s'applique dès qu'il change (#2920). La vue jouée telle qu'elle est,
// devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FactsOfRuntime } from "../../../runtime/src/etat.ts";
import type { Home } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import { readStations, type Guide, type StationChanged, type StationsRead, type StationWanted } from "../../src/service.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { APPLIES, capSays } from "../../src/vue/stations-declared.js";
import { NOT_ANNOUNCED } from "../../src/vue/stations-tab/state.js";
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

type OfRuntime = FactsOfRuntime["stations"][number];
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

// Ce que la box déclare (`installation stations --json`) : elle-même, et ce Mac que l'app lui a ajouté.
const DECLARED =
  readStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
        { nom: "macbook/claude", moteur: "claude", fournit: ["code", "raisonnement", "navigateur-headless"], cooks: 2, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");

const guide = (stations: StationsRead): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start: the station runs with the app" },
  termine: true,
  controle: { a: A, stations },
});

const PROJECT: Project = { nom: PARADE, dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const startup = (seenOne: SeenOfProjects) => () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PROJECT] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
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
  declaredEntries: StationsRead = DECLARED,
  changeOneStation: (project: string, name: string, wanted: StationWanted) => StationChanged | Promise<StationChanged> = (_, name) => ({ fait: `${name} saved; the other stations are unchanged` }),
): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup(seenOne), espace: () => [], service: () => guide(declaredEntries), defautsDeStation: () => ({ refus: "pas ici" }), changerUneStation: changeOneStation });
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
const capOf = (pose: Fake) => pose.dessous("div").find(({ className, dataset }) => className === "reglage" && dataset.cle === "cooks") ?? assert.fail(`pas de rangée des cooks sous ${pose.dataset.station}`);
const fieldOfCap = (pose: Fake) => capOf(pose).dessous("input")[0] ?? assert.fail(`pas de champ du plafond sous ${pose.dataset.station}`);
const saysUnder = (pose: Fake) => capOf(pose).children.filter(({ className }) => className.startsWith("dit")).map(({ className, textContent }) => [className, textContent]);

describe("une carte par station qui sert le projet, chacune une fois (#1786, #3195)", () => {
  test("celle de `facts`, rattachée à sa station appairée ; celle que la box déclare sans qu'elle s'y soit annoncée ; pas celle qui ne le sert pas", async () => {
    const vue = await open();
    assert.deepEqual(lines(vue).map(({ dataset }) => dataset.station), ["gbox", "macbook/claude"]);
    // La box est en ligne, et cuit #14 ; le Mac, déclaré, ne s'est pas annoncé : pas de vert. Le PC, ajouté par l'app mais qui
    // ne sert pas le projet, n'est nulle part dans l'onglet.
    assert.deepEqual(lines(vue).map(stateOf), [["online", "vert"], [NOT_ANNOUNCED, "gris"]]);
    assert.match(line(vue, "gbox").textContent, /#14/);
    assert.match(line(vue, "macbook/claude").textContent, /idle/);
    const tab = vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet");
    assert.doesNotMatch(tab.textContent, /\bpc\b|what each station provides|not received by the station|check again/);
    // Ses cooks à la fois, dans « Details » : sa rangée, et son champ.
    assert.equal(capOf(line(vue, "macbook/claude")).children[1]?.children[0]?.textContent, capSays(2));
    assert.equal(fieldOfCap(line(vue, "macbook/claude")).value, "2");
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

  test("le plafond d'une station se règle dans « Details », sans « Save » : changé, il part aussitôt, la déclaration entière avec lui", async () => {
    let release = () => {};
    const retainedOne = new Promise<void>((resolved) => (release = resolved));
    const vue = await open(seenOf(ON_THE_BOX), STATIONS_OF_FACTS, DECLARED, async (_, name) => {
      await retainedOne;
      return { fait: `${name} saved; the other stations are unchanged` };
    });
    assert.equal(line(vue, "macbook/claude").dessous("button").some(({ textContent }) => /^(save|saving…|set the cap)$/i.test(textContent)), false);
    const field = fieldOfCap(line(vue, "macbook/claude"));
    field.value = "4";
    field.declencher("input");
    field.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "macbook/claude", { cooks: 4, fournit: ["code", "raisonnement", "navigateur-headless"] }]);
    // En route : sa rangée le dit, son champ attend.
    assert.deepEqual(saysUnder(line(vue, "macbook/claude")), [["dit en-cours", APPLIES]]);
    assert.equal(fieldOfCap(line(vue, "macbook/claude")).disabled, true);
    release();
    await repos();
    assert.deepEqual(saysUnder(line(vue, "macbook/claude")), [["dit fait", "macbook/claude saved; the other stations are unchanged"]]);
    assert.equal(fieldOfCap(line(vue, "macbook/claude")).disabled, false);
  });

  test("un plafond refusé : le refus sous sa rangée, et le champ revient à la valeur en vigueur", async () => {
    const vue = await open(seenOf(ON_THE_BOX), STATIONS_OF_FACTS, DECLARED, (_, name) => ({ refus: `Nothing was saved: how many cooks ${name} runs at once is a whole number, from 1 to 99.`, detail: "exit 2" }));
    const field = fieldOfCap(line(vue, "macbook/claude"));
    field.value = "0";
    field.declencher("input");
    field.declencher("change");
    await repos();
    const pose = line(vue, "macbook/claude");
    assert.deepEqual(saysUnder(pose).map(([classe]) => classe), ["dit refus"]);
    assert.match(capOf(pose).textContent, /whole number, from 1 to 99/);
    assert.equal(fieldOfCap(pose).value, "2");
  });
});

describe("chaque carte dit sa station telle que `facts` la voit (#1830)", () => {
  // mirrorscreen : la box déclare le Mac mais il ne s'est jamais manifesté à elle ; l'app, elle, le lit en ligne sur GitHub.
  const WITHOUT_DECLARATION = readStations(JSON.stringify({ etape: { id: "stations", etat: "faite" }, proposees: [], absent: null, declarees: [] })) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");
  const THE_BOX = station("box/claude", { cooks: [COOK_14], fournit: ["code", "raisonnement"], presente: true, vueLe: null });
  const THE_MAC = station("macbook/claude", { distante: true, ensemble: true, fournit: ["code", "raisonnement", "navigateur-headless", "macos"], presente: false, vueLe: null });

  test("que la box ne voit pas, le Mac ne cuit pas — jamais vert, même en ligne sur GitHub ; la box, elle, est en ligne", async () => {
    const vue = await open(seenOf(ON_THE_BOX), [THE_BOX, THE_MAC], WITHOUT_DECLARATION);
    assert.deepEqual(stateOf(line(vue, "gmac")), ["not seen by the kitchen", "rouge"]);
    assert.deepEqual(stateOf(line(vue, "gbox")), ["online", "vert"]);
  });

  test("le Mac se manifeste à la box : il est en ligne ; tu depuis, il le redit, et depuis quand", async () => {
    const vue = await open(seenOf(ON_THE_BOX), [THE_BOX, { ...THE_MAC, presente: true, vueLe: "2026-10-27T10:03:00.000Z" }], WITHOUT_DECLARATION);
    assert.deepEqual(stateOf(line(vue, "gmac")), ["online", "vert"]);
    const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: [THE_BOX, { ...THE_MAC, vueLe: "2026-10-27T10:03:00.000Z" }] }) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(stateOf(line(vue, "gmac")), ["not seen by the kitchen for 1 min", "rouge"]);
  });
});
