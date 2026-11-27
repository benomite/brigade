// La page d'un projet sur un écran étroit — le téléphone (#1186) : trois onglets, Rail, Stations et la conversation avec le
// second, qui prend la place du panneau de droite. Stations y montre les lignes des stations, leur état,
// leurs cooks, sans bouton sur ces lignes — ni le plafond. Rail y est celui d'un écran large ; le dernier onglet ouvert est retenu. Sur un écran large, rien ne
// change : deux onglets, et le second à droite.
// La vue est jouée telle qu'elle est, devant un faux document et un faux écran (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FactsOfRuntime } from "../../runtime/src/etat.ts";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { calibrationRecommended, EFFORTS, MODELS, type SeenOfProjects } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminals.ts";
import { AT_REST } from "../src/vue/stations-tab/stations-tab.js";
import { FakeScreen, FakeStorage, type Fake, type Played, playTheVue, repos } from "./helpers/false-vue.ts";

const A = "2026-10-20T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJECTS = [{ nom: PARADE, dossier: "/tmp/parade" }];
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

type OfRuntime = FactsOfRuntime["stations"][number];
// Une station telle que le runtime la rend dans `facts` (runtime/src/etat.ts, #1183) : avec son plafond, ses tickets
// ordinaires et son bac à sable — ce qui se règle, et qu'un écran étroit ne montre pas.
const station = (name: string, more: Partial<OfRuntime> = {}): OfRuntime => ({
  station: name,
  distante: false,
  plafond: 2,
  ordinaires: true,
  bacASable: { disponible: true, raison: null, version: "2.1.250", depuis: "2026-10-13T09:30:00.000Z" },
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...more,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
// #14 cuit sur la box ; le Mac, distant, est arrêté par le chef et #15 y finit ; l'atelier refuse le projet.
const REFUSAL = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };
const ACCESS = { bloque: "fetch" as const, raison: "parade-box cannot fetch from benomite/parade: github.com asks for a username (git: fatal: could not read Username).", geste: "Run `gh auth setup-git` on parade-box." };
const projectsOfStations = (): SeenOfProjects => ({
  a: A,
  projets: [{ nom: PARADE, depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: "servi", dit: "", autoriser: [] }], servi: null, acces: ACCESS, refus: null, worktree: null }],
  recommandee: "g1",
  avertissements: {},
  machines: {},
  calibrage: calibrationRecommended([]),
});
const STATIONS: OfRuntime[] = [
  station("box/claude", { cooks: [COOK_14] }),
  station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-20T10:01:11.000Z", cooks: [COOK_15] }),
  station("atelier/claude", { cuisson: "refused", refus: REFUSAL }),
];
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-20T10:04:11.000Z",
  dernierTick: "2026-10-20T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 2, aLaPass: 1, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/benomite/brigade/issues/14", activite: null },
    { ticket: 15, etat: "pris", titre: COOK_15.titre, url: "https://github.com/benomite/brigade/issues/15", activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: "https://github.com/benomite/brigade/issues/30", activite: { fait: "gates en cours", cible: null, depuis: "2026-10-20T10:03:41.000Z" } },
  ],
  cooks: [COOK_14, COOK_15],
  attend: [],
};

function drawable(stations: OfRuntime[]): Drawable {
  const facts = { ...FACTS, stations };
  return holdFacts(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
}

// L'espace de parade, ses faits lus, sur un écran étroit ou large.
async function open({ etroit: narrow = true, stockage: storage }: { etroit?: boolean; stockage?: FakeStorage } = {}) {
  const screen = new FakeScreen(narrow);
  const vue = await playTheVue(
    {
      demarrage: startup,
      espace: () => [SECOND],
      machines: () => [{ id: "poste", titre: "this computer" }],
    },
    { stockage: storage, ecran: screen },
  );
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  vue.dire("surFaits", { ...drawable(STATIONS), demande: vue.dernier("faits")[0] as number });
  await repos();
  return { vue, ecran: screen };
}

const tabs = (vue: Played) => vue.element("onglets-du-projet").children;
const titles = (vue: Played) => tabs(vue).map((tab) => tab.textContent);
// L'onglet montré : l'entrée du menu marquée.
const shows = (vue: Played) => tabs(vue).filter((tab) => tab.ariaSelected === "true").map((tab) => tab.textContent);
async function type(vue: Played, title: string): Promise<void> {
  (tabs(vue).find((tab) => tab.textContent === title) ?? assert.fail(`pas d'onglet « ${title} »`)).click();
  await repos();
}
// Ce qui est à l'écran du projet : le centre, ou le second — jamais les deux sur un écran étroit.
const seenOne = (vue: Played) => ({ centre: !vue.element("centre").hidden, second: !vue.element("second").hidden });
// Les cartes des stations de l'onglet Stations (#3195) : son état, ce qu'elle tient.
const lines = (vue: Played) => vue.element("rail").dessous("section").filter((card) => card.className === "carte-de-station");
const line = (vue: Played, name: string) => lines(vue).find((card) => card.dataset.station === name) ?? assert.fail(`pas de carte pour ${name}`);
const stateOf = (pose: Fake) => pose.dessous("span").find((span) => span.className === "pilule etat")?.textContent;
const cooksOf = (pose: Fake) => (pose.dessous("ul")[0]?.children ?? pose.dessous("p").filter(({ className }) => className === "au-repos")).map((li) => li.textContent);
// Les gestes posés sous un élément : ses boutons, sauf l'icône d'aide qui porte un survol.
const actions = (pose: Fake) => pose.dessous("button").filter((button) => button.className !== "aide");
// Un élément de la vue, par son `id`, posé dans l'onglet montré.
const inTheRail = (vue: Played, id: string) => [...vue.element("rail").descendants()].some((pose) => pose.id === id);
const columns = (vue: Played) => vue.element("rail").dessous("section").filter((pose) => pose.className === "colonne").map((column) => column.children[0]?.children[0]?.textContent);

describe("la page d'un projet sur un écran étroit : trois onglets", () => {
  test("Rail, Stations et Second, et chacun se montre d'un tap : le second à la place du centre, jamais à côté", async () => {
    const { vue, ecran: screen } = await open();
    assert.ok(screen.requetes.length > 0, "la vue demande la largeur de l'écran");
    assert.deepEqual(titles(vue), ["Rail", "Stations", "Agents", "Know-how", "Settings", "Second"]);
    assert.deepEqual(shows(vue), ["Rail"]);
    assert.deepEqual(seenOne(vue), { centre: true, second: false });

    await type(vue, "Second");
    assert.deepEqual(shows(vue), ["Second"]);
    assert.deepEqual(seenOne(vue), { centre: false, second: true });
    assert.equal(vue.element("main").hasAttribute("data-conversation"), true);
    // Le second y est entier : ses onglets de terminaux et de quoi ouvrir un shell.
    assert.deepEqual(vue.element("terminaux").children.map((tab) => tab.textContent), ["second · claude", "+ shell"]);
    // Ni les stations du projet, ni la note d'un onglet ne restent au-dessus de lui.
    assert.equal(vue.element("stations-du-projet").hidden, true);
    assert.equal(vue.element("note").hidden, true);

    await type(vue, "Stations");
    assert.deepEqual(shows(vue), ["Stations"]);
    assert.deepEqual(seenOne(vue), { centre: true, second: false });
    assert.equal(vue.element("main").hasAttribute("data-conversation"), false);
    assert.equal(vue.element("rail").dataset.onglet, "stations");

    await type(vue, "Rail");
    assert.deepEqual(shows(vue), ["Rail"]);
    assert.deepEqual(seenOne(vue), { centre: true, second: false });
    assert.equal(vue.element("rail").dataset.onglet, "rail");
  });

  test("la conversation ne perd rien d'un onglet à l'autre : le même terminal, avec ce qu'il avait reçu", async () => {
    const { vue } = await open();
    await type(vue, "Second");
    vue.dire("surSortie", SECOND.id, "> une conversation en cours\r\n");
    const [terminal] = vue.xterms;
    const [frame] = vue.element("fil").children;
    for (const title of ["Rail", "Stations", "Second", "Rail", "Second"]) {
      await type(vue, title);
      assert.equal(vue.xterms.length, 1, title);
      assert.equal(vue.xterms[0], terminal, title);
      assert.equal(vue.element("fil").children[0], frame, title);
      assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n"], title);
    }
    // Ce qu'il reçoit pendant qu'un autre onglet est montré l'attend.
    await type(vue, "Rail");
    vue.dire("surSortie", SECOND.id, "suite\r\n");
    await type(vue, "Second");
    assert.deepEqual(terminal?.ecrits, ["> une conversation en cours\r\n", "suite\r\n"]);
    assert.equal(frame?.hidden, false);
    // L'espace n'est pas rouvert pour autant.
    assert.equal(vue.appels.filter(({ geste: action }) => action === "espace").length, 1);
  });

  test("une page ouverte par-dessus — Settings — couvre la conversation comme elle couvre Rail, et la referme rend la conversation", async () => {
    const { vue } = await open();
    await type(vue, "Second");
    (vue.element("onglets-du-projet").children.find((tab) => tab.textContent === "Settings") ?? assert.fail("pas de Settings")).click();
    await repos();
    assert.deepEqual(shows(vue), ["Settings"]);
    assert.deepEqual(seenOne(vue), { centre: true, second: false });
    assert.equal(vue.element("contenu").hidden, false);
    await type(vue, "Second");
    assert.deepEqual(seenOne(vue), { centre: false, second: true });
  });

  test("le dernier onglet ouvert est retenu : l'app rouvre le projet sur la conversation", async () => {
    const storage = new FakeStorage();
    const { vue } = await open({ stockage: storage });
    await type(vue, "Second");
    const { vue: reopened } = await open({ stockage: storage });
    assert.deepEqual(shows(reopened), ["Second"]);
    assert.deepEqual(seenOne(reopened), { centre: false, second: true });
    // Sur un écran large, la conversation n'est pas un onglet : le même projet s'y rouvre sur Rail, le second à droite.
    const { vue: large } = await open({ stockage: storage, etroit: false });
    assert.deepEqual(titles(large), ["Rail", "Stations", "Agents", "Know-how", "Settings"]);
    assert.deepEqual(shows(large), ["Rail"]);
    assert.deepEqual(seenOne(large), { centre: true, second: true });
  });

  test("Rail y est celui d'un écran large : ses colonnes, et la ligne qui ouvre Stations", async () => {
    const { vue } = await open();
    assert.deepEqual(columns(vue), ["Backlog", "Manager", "Cooks", "Pass", "Served"]);
    vue.dire("surProjetsDesStations", projectsOfStations());
    await repos();
    const alert = vue.element("rail").dessous("p").find((p) => p.className === "alerte-de-cuisine") ?? assert.fail("pas de ligne d'alerte");
    assert.match(alert.textContent, /parade-box cannot fetch from benomite\/parade/);
    (alert.dessous("button")[0] ?? assert.fail("pas de lien")).click();
    await repos();
    assert.deepEqual(shows(vue), ["Stations"]);
  });
});

describe("l'onglet Stations d'un écran étroit, en lecture seule", () => {
  test("chaque station a sa carte, son état et ses cooks, et aucun geste", async () => {
    const { vue } = await open();
    await type(vue, "Stations");
    assert.deepEqual(lines(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude", "atelier/claude"]);
    assert.deepEqual(lines(vue).map(stateOf), ["online", "stopped by you, for 3 min · 1 cook finishing", "refusing itThis computer cannot run the project's cooks in Claude Code's sandbox."]);
    assert.deepEqual(cooksOf(line(vue, "box/claude")), ["#14Le journal en ajout seul"]);
    assert.deepEqual(cooksOf(line(vue, "mac/claude")), ["#15La carte des desserts"]);
    assert.deepEqual(cooksOf(line(vue, "atelier/claude")), [AT_REST]);
    // Rien ne se clique sur une carte de station, et « Details » n'y est pas.
    assert.deepEqual(lines(vue).map((li) => actions(li).length), [0, 0, 0]);
    assert.deepEqual(lines(vue).flatMap((li) => li.dessous("details")), []);
    // Ni la carte du projet, ni Taken et Pass — leurs fiches ont leurs gestes —, ni les serveurs de livraison.
    assert.deepEqual(columns(vue), []);
    assert.equal(inTheRail(vue, "carte"), false);
    assert.equal(vue.element("rail").dessous("li").some((li) => li.className === "bon"), false);
  });

  test("aucun réglage : ni les stations à régler, ni le plafond, ni le bac à sable", async () => {
    const { vue } = await open();
    await type(vue, "Stations");
    // Les stations à régler — en ajouter une, déménager la cuisine, le bac à sable de celle qu'on choisit — sont rangées.
    assert.equal(vue.element("stations-du-projet").hidden, true);
    // La lecture de `station` — le plafond, la machine, le quota — et le bouton qui règle le plafond ne sont pas posés.
    assert.equal(inTheRail(vue, "lecture-cuisine"), false);
    assert.equal(inTheRail(vue, "gestes-cuisine"), false);
    await repos();
    const text = vue.element("rail").textContent;
    for (const setting of [/cap/i, /at most/, /quota/, /move the kitchen/, /Set the cooks/, /ordinary/i]) assert.doesNotMatch(text, setting);
  });
});

describe("sur un écran large, rien ne change", () => {
  test("deux onglets, et le second à droite quel que soit l'onglet ; Stations porte ses stations", async () => {
    const { vue } = await open({ etroit: false });
    assert.deepEqual(titles(vue), ["Rail", "Stations", "Agents", "Know-how", "Settings"]);
    assert.deepEqual(seenOne(vue), { centre: true, second: true });
    await type(vue, "Stations");
    assert.deepEqual(seenOne(vue), { centre: true, second: true });
    assert.deepEqual(columns(vue), []);
    // La carte du projet est fondue dans le bloc de ses stations (#1456) ; l'onglet est un seul composant (#3195).
    assert.equal(inTheRail(vue, "carte"), false);
    assert.ok(vue.element("rail").children.some(({ dataset }) => dataset.bloc === "stations-tab"));
    assert.deepEqual(lines(vue).flatMap((li) => actions(li)).filter((button) => /^(stop|start) cooking$/.test(button.textContent)), []);
  });

  test("la fenêtre qui se rétrécit passe à trois onglets, et qui s'élargit revient à deux, le second à droite", async () => {
    const { vue, ecran: screen } = await open({ etroit: false });
    screen.changer(true);
    await repos();
    assert.deepEqual(titles(vue), ["Rail", "Stations", "Agents", "Know-how", "Settings", "Second"]);
    assert.deepEqual(seenOne(vue), { centre: true, second: false });
    await type(vue, "Second");
    screen.changer(false);
    await repos();
    assert.deepEqual(titles(vue), ["Rail", "Stations", "Agents", "Know-how", "Settings"]);
    assert.deepEqual(shows(vue), ["Rail"]);
    assert.deepEqual(seenOne(vue), { centre: true, second: true });
  });
});
