// La station locale sur l'onglet Stations (#2489, épique #2484) : ses dossiers — le clone du projet et les worktrees de
// ses cooks —, son bac à sable et sa connexion à Claude, chacun avec son niveau. Les autres stations n'ont rien de cela.
// Chaque geste a l'effet qu'il avait ailleurs dans l'app : le bac à sable se règle par le même appel que la ligne des
// tickets ordinaires de Settings (« this computer »), la connexion se refait par le login de la panne de la station. Les
// téléphones appairés n'y sont plus (#2500) : aucune station n'appaire de téléphone. Le module est joué devant une
// fabrique de faux éléments ; la vue entière, contre le faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { blockOfOrdinary } from "../../../src/ordinary.ts";
import type { Outage } from "../../../src/outages/outages.ts";
import { calibrationRecommended, EFFORTS, MODELS, type SeenOfProjects } from "../../../src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { LEVELS_SAID } from "../../../src/vue/levels.js";
import { type StateOfTheStationLocale, type ActionsOfTheStationLocale, linesOfTheStationLocale } from "../../../src/vue/project/stations/LocalStation.js";
import { Fake, type Played, playTheVue, openRead, openTab, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
// Les lignes de la station de cet ordinateur, posées dans « Details » de sa carte (#3195) : ici, dans un élément à elles.
const setBlockStationLocale = (fabrique: typeof doc, state: StateOfTheStationLocale, actions?: ActionsOfTheStationLocale) => {
  const block = new Fake("div");
  block.append(...(linesOfTheStationLocale(fabrique, state, actions) as unknown as Fake[]));
  return block;
};
const A = "2026-11-05T21:00:00.000Z";
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", ordinaires: true, limiteCooks: 2 };
const FOLDERS = { clone: "/Users/chef/brigade-atelier/clones/parade", worktrees: "/Users/chef/brigade-atelier/worktrees/parade" };
const LOST: Outage = { cle: "connexion-max:2026-11-05T20:40:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 20 min ago", survol: "nothing cooks on macbook until you log in", bouton: { libelle: "log in", geste: "login" } };
const station = (id: string, max: StationVue["max"], outages: Outage[] = []): StationVue => ({ id, nom: id, machine: "", etat: "en-ligne", ligne: "online", pannes: outages, dit: "online", version: "", projets: ["parade"], max });

// Les lignes du bloc : le nom de chaque réglage (son étiquette de niveau comprise), et sa valeur.
const lines = (block: Fake) => block.dessous("div").filter(({ className }) => className === "reglage");
const nameOf = (line: Fake) => line.children[0]?.firstChild;
const valueOf = (line: Fake) => line.children[1]?.children[0]?.textContent;
const levelOf = (line: Fake) => [...line.descendants()].filter(({ className }) => className === "niveau").map(({ textContent }) => textContent);
const buttons = (block: Fake, text: string) => block.dessous("button").filter(({ textContent }) => textContent === text);

const state = (more: Partial<StateOfTheStationLocale> = {}): StateOfTheStationLocale => ({
  poste: "this computer",
  projet: "parade",
  station: station("macbook", "connectee"),
  dossiers: FOLDERS,
  ordinaires: blockOfOrdinary(PARADE, "darwin", undefined, true) ?? null,
  ...more,
});

describe("les lignes de la station locale", () => {
  test("ses dossiers, son bac à sable et sa connexion à Claude, chacun avec son niveau — aucun téléphone à appairer", () => {
    const block = setBlockStationLocale(doc, state()) as unknown as Fake;
    const poses = lines(block);
    assert.deepEqual(
      poses.map((line) => [nameOf(line), valueOf(line)]),
      [
        ["clone folder", FOLDERS.clone],
        ["worktrees folder", FOLDERS.worktrees],
        ["sandbox · ordinary tickets", "taken"],
        ["cooks at once", "2"],
        ["Claude connection", "connected"],
      ],
    );
    // Chaque réglage dit son niveau : tous vivent sur cette machine.
    for (const line of poses) assert.deepEqual(levelOf(line), [LEVELS_SAID.machine.libelle], String(nameOf(line)));
    assert.deepEqual(poses.map(({ dataset }) => dataset.cle), ["dossier", "dossier", "ordinaires", "ordinaires", "claude"]);
    // Connectée, rien à refaire : pas de « log in ». Et rien n'appaire un téléphone.
    assert.deepEqual(buttons(block, "log in"), []);
    assert.doesNotMatch(block.textContent, /phone/i);
  });

  test("ce qui n'est pas encore lu le dit ; ce qui ne se lit pas, en une ligne, sa raison au survol", () => {
    const inRoute = setBlockStationLocale(doc, { poste: "this computer", projet: "parade" }) as unknown as Fake;
    assert.deepEqual(lines(inRoute).map((line) => [nameOf(line), valueOf(line)]), [
      ["folders", "Reading…"],
      ["sandbox", "Reading…"],
      ["Claude connection", "Reading…"],
    ]);
    const rates = setBlockStationLocale(doc, state({ dossiers: { refus: "its folders could not be read", detail: "ENOENT" } })) as unknown as Fake;
    const [folders] = lines(rates);
    assert.equal(folders?.children[1]?.children[0]?.children[0]?.textContent, "Folders not reached.");
    assert.ok(rates.dessous("button").some(({ ariaLabel }) => ariaLabel === "its folders could not be read — ENOENT"));
  });

  test("le bac à sable : hors d'un Mac il n'y en a pas, et un projet qui ne cuit pas ici n'en a pas", () => {
    const pc = setBlockStationLocale(doc, state({ poste: "this computer", ordinaires: blockOfOrdinary(PARADE, "win32", undefined, true) ?? null })) as unknown as Fake;
    const sandbox = lines(pc).find(({ dataset }) => dataset.cle === "ordinaires") ?? assert.fail("pas de ligne");
    assert.deepEqual([nameOf(sandbox), valueOf(sandbox)], ["sandbox", "none on this computer"]);
    assert.deepEqual(pc.dessous("input"), []);
    const elsewhere = setBlockStationLocale(doc, state({ ordinaires: null })) as unknown as Fake;
    assert.equal(valueOf(lines(elsewhere).find(({ dataset }) => dataset.cle === "ordinaires") ?? assert.fail("pas de ligne")), "parade does not cook on this computer");
  });

  test("chaque geste appelle le sien : le bac à sable, le login de la panne", () => {
    const facts: unknown[][] = [];
    const block = setBlockStationLocale(doc, state({ station: station("macbook", "perdue", [LOST]) }), {
      regler: (active, limit, or) => void facts.push(["regler", active, limit, or]),
      seConnecter: (key) => void facts.push(["seConnecter", key]),
    }) as unknown as Fake;
    assert.equal(valueOf(lines(block).find(({ dataset }) => dataset.cle === "claude") ?? assert.fail("pas de ligne")), "lost");
    const limit = block.dessous("input")[0] ?? assert.fail("pas de limite");
    switchOf(block).click();
    limit.value = "";
    limit.declencher("change");
    const [login] = buttons(block, "log in");
    assert.equal(login?.className, "recommande");
    login?.click();
    assert.deepEqual(facts, [["regler", false, 2, "option"], ["regler", false, null, "limite"], ["seConnecter", LOST.cle]]);
  });

  test("aucun « Save » ; un changement en route se dit sous sa rangée, les contrôles du bac à sable attendent ; un refus se lit sous la sienne", () => {
    const block = setBlockStationLocale(doc, state()) as unknown as Fake;
    assert.deepEqual(block.dessous("button").filter(({ textContent }) => /^(save|saving…)$/i.test(textContent)), []);
    const saysUnder = (pose: Fake) => lines(pose).map((line) => line.children.filter(({ className }) => className.startsWith("dit")).map(({ className, textContent }) => [className, textContent]));
    const inRoute = setBlockStationLocale(doc, state({ reglageDit: { ou: "limite", dit: { enCours: "applying…" } } })) as unknown as Fake;
    assert.deepEqual(saysUnder(inRoute), [[], [], [], [["dit en-cours", "applying…"]], []]);
    assert.ok([...inRoute.dessous("input"), switchOf(inRoute)].every(({ disabled }) => disabled));
    const refuses = setBlockStationLocale(doc, state({ reglageDit: { ou: "option", dit: { refus: "nothing was written: EACCES" } } })) as unknown as Fake;
    assert.deepEqual(saysUnder(refuses), [[], [], [["dit refus", "nothing was written: EACCES"]], [], []]);
    assert.ok([...refuses.dessous("input"), switchOf(refuses)].every(({ disabled }) => !disabled));
  });
});

// L'interrupteur d'un bloc (components/switch) : son état se lit sur `aria-checked`, un clic le demande contraire.
const switchOf = (pose: Fake) => pose.dessous("button").find(({ role }) => role === "switch") ?? assert.fail("pas d'interrupteur");

describe("la station locale dans l'onglet Stations", () => {
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
  // La station de ce Mac, et la box — qui a perdu sa connexion : rien d'elle ne doit se lire dans le bloc.
  const STATIONS = (locale: StationVue): SeenOfStations => ({ a: A, stations: [locale, station("box", "perdue", [{ ...LOST, cle: "connexion-max:box" }])] });
  const PROJECTS_OF_STATIONS: SeenOfProjects = { a: A, projets: [], locale: "macbook", recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommended([]) };

  const play = (locale: StationVue, set: (...args: unknown[]) => string | undefined = () => undefined) =>
    playTheVue({
      demarrage: () => ({
        poste: { nom: "this computer", mac: true },
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: {},
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
        stations: STATIONS(locale),
        projetsDesStations: PROJECTS_OF_STATIONS,
      }),
      espace: () => [SECOND],
      ordinaires: () => blockOfOrdinary(PARADE, "darwin", undefined, true),
      reglerOrdinaires: set,
      dossiersDeLaStation: () => FOLDERS,
      panne: () => ({ fait: "the login page opens in your browser" }),
    });
  const openTheProject = async (vue: Played) => {
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case")).click();
    await repos();
  };
  // La carte de cet ordinateur sur l'onglet Stations (#3195), et ses lignes, dans « Details ».
  const cardHere = (vue: Played) => vue.element("rail").dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === "macbook") ?? assert.fail("pas de carte de cet ordinateur");
  const theBlock = (vue: Played) => cardHere(vue).dessous("div").find(({ className }) => className === "details-de-station") ?? assert.fail("pas de « Details » de cet ordinateur");

  test("sur Stations, la station de ce Mac montre ses trois réglages, lus pour elle seule — la box n'y est pas", async () => {
    const vue = await play(station("macbook", "connectee"));
    await openTheProject(vue);
    await openTab(vue, "Stations");
    await repos();
    const block = theBlock(vue);
    assert.deepEqual(lines(block).map((line) => [nameOf(line), valueOf(line)]), [
      ["clone folder", FOLDERS.clone],
      ["worktrees folder", FOLDERS.worktrees],
      ["sandbox · ordinary tickets", "taken"],
      ["cooks at once", "2"],
      ["Claude connection", "connected"],
    ]);
    assert.deepEqual(vue.dernier("dossiersDeLaStation"), ["parade"]);
    // La connexion perdue de la box ne s'y lit pas.
    assert.deepEqual(buttons(block, "log in"), []);
    assert.doesNotMatch(block.textContent, /\bbox\b/);
    // Une seule carte porte ces réglages sur l'onglet, et son « Details » est replié.
    assert.equal(vue.element("rail").dessous("div").filter(({ className, textContent }) => className === "details-de-station" && textContent.includes("clone folder")).length, 1);
    assert.equal((cardHere(vue).dessous("details")[0] as unknown as { open?: boolean } | undefined)?.open, false);
    // Ni « Local station », ni la station locale en pseudo-station à elle.
    assert.doesNotMatch(vue.element("rail").textContent, /Local station/);
  });

  test("un ordinateur dont la station ne sert pas le projet n'a pas de carte : rien de ses réglages ne se lit sur l'onglet", async () => {
    const vue = await play({ ...station("macbook", "connectee"), projets: [] });
    await openTheProject(vue);
    await openTab(vue, "Stations");
    await repos();
    assert.equal(vue.element("rail").dessous("section").some(({ className, dataset }) => className === "carte-de-station" && dataset.station === "macbook"), false);
    assert.doesNotMatch(vue.element("rail").textContent, /clone folder|worktrees folder|sandbox ·/);
  });

  test("régler le bac à sable sur Stations fait le même appel que la ligne des tickets ordinaires de Settings", async () => {
    const vue = await play(station("macbook", "connectee"));
    await openTheProject(vue);
    // Dans Settings, sous « this computer » : décocher, puis écrire 4 cooks à la fois.
    await openRead(vue, "Settings");
    const limit = vue.element("ordinaires").dessous("input")[0] ?? assert.fail("pas de limite dans Settings");
    switchOf(vue.element("ordinaires")).click();
    await repos();
    limit.value = "4";
    limit.declencher("change");
    await repos();
    const inSettings = vue.appels.filter(({ geste: action }) => action === "reglerOrdinaires").map(({ args }) => args);
    vue.appels.length = 0;
    // Les mêmes gestes sur Stations.
    await openTab(vue, "Stations");
    await repos();
    const howMany = theBlock(vue).dessous("input")[0] ?? assert.fail("pas de limite sur Stations");
    switchOf(theBlock(vue)).click();
    await repos();
    howMany.value = "4";
    howMany.declencher("change");
    await repos();
    const onStations = vue.appels.filter(({ geste: action }) => action === "reglerOrdinaires").map(({ args }) => args);
    assert.deepEqual(inSettings, [["parade", false, 2], ["parade", false, 4]]);
    assert.deepEqual(onStations, inSettings);
    // Écrit, il est relu : la ligne montre ce que la station a maintenant.
    assert.equal(vue.appels.filter(({ geste: action }) => action === "ordinaires").length >= 2, true);
  });

  test("un réglage refusé dit pourquoi, sous sa ligne", async () => {
    const vue = await play(station("macbook", "connectee"), () => "nothing was written: EACCES");
    await openTheProject(vue);
    await openTab(vue, "Stations");
    await repos();
    switchOf(theBlock(vue)).click();
    await repos();
    await repos();
    assert.deepEqual(theBlock(vue).dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent), ["nothing was written: EACCES"]);
    // Sous la rangée qui a changé, et la case relue revient à la valeur en vigueur.
    const sandbox = lines(theBlock(vue)).find(({ dataset }) => dataset.cle === "ordinaires") ?? assert.fail("pas de bac à sable");
    assert.ok(sandbox.children.some(({ className }) => className === "dit refus"));
    assert.equal(switchOf(theBlock(vue)).ariaChecked, "true");
  });

  test("un changement du bac à sable s'applique aussitôt : « applying… » sous sa rangée tant qu'il est en route", async () => {
    let release = (_: string | undefined) => {};
    const vue = await play(station("macbook", "connectee"), () => new Promise<string | undefined>((resolved) => (release = resolved)) as never);
    await openTheProject(vue);
    await openTab(vue, "Stations");
    await repos();
    const limit = theBlock(vue).dessous("input")[0] ?? assert.fail("pas de limite");
    limit.value = "3";
    limit.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), ["parade", true, 3]);
    assert.ok(theBlock(vue).dessous("p").some(({ className, textContent }) => className === "dit en-cours" && textContent === "applying…"));
    assert.ok([...theBlock(vue).dessous("input"), switchOf(theBlock(vue))].every(({ disabled }) => disabled));
    release(undefined);
    await repos();
    await repos();
    assert.equal(theBlock(vue).dessous("p").some(({ className }) => className.startsWith("dit en-cours")), false);
    assert.ok([...theBlock(vue).dessous("input"), switchOf(theBlock(vue))].every(({ disabled }) => !disabled));
  });

  test("connexion perdue : « log in » joue le login de la panne de cette station, comme sur sa page, et ce qu'il a rendu se lit dessous", async () => {
    const vue = await play(station("macbook", "perdue", [LOST]));
    await openTheProject(vue);
    await openTab(vue, "Stations");
    await repos();
    const [login] = buttons(theBlock(vue), "log in");
    login?.click();
    await repos();
    await repos();
    assert.deepEqual(vue.dernier("panne"), ["macbook", LOST.cle]);
    assert.ok(theBlock(vue).dessous("p").some(({ className, textContent }) => className === "dit" && textContent === "the login page opens in your browser"));
  });
});
