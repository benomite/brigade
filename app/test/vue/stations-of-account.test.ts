// Les stations enregistrées sous le compte GitHub du chef (#1706, épique 1702), dans la liste des stations de l'accueil
// (#1778, épique 1777) : une ligne par machine — une machine appairée se dit par sa présence, et son enregistrement ne
// pose ni seconde ligne, ni section « Under your GitHub account » ; une machine seulement enregistrée a sa ligne, en
// ligne ou non, avec les projets qu'elle sert ; ouverte, les projets du chef à cocher, chaque case écrite aussitôt, et les
// autres dépôts du compte par la recherche seulement (#1780) — jamais leur liste entière ; sans
// station, la commande qui en installe une. Les stations sont écrites par les fonctions mêmes du runtime (`stationDuGist`,
// `echecDeGh`) : ce que la vue pose est ce qu'elle recevra. La vue jouée entière va jusqu'au gist : ce qui est coché est
// écrit selon le contrat (stations-of-account.ts), relu par le lecteur du runtime au lancement suivant, et coché encore.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Home, type LineOfStation, lineOfStation } from "../../src/home.ts";
import { reasonOf } from "../../src/stations/reason.ts";
import { echecDeGh } from "../../../runtime/src/appairage/stations-du-chef.ts";
import * as contract from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { REFUSAL_GITHUB, type StationRecorded, type StationsOfAccount } from "../../src/stations-of-account.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import {
  NO,
  COPIED,
  COPY,
  UNREADABLE,
  INSTALLER,
  readOfAccount,
  lineOfTheRecorded,
  lineFade,
  projectsServed,
  REREAD,
  oneLineByMachine,
  type StateOfAccount,
  type ActionsOfAccount,
} from "../../src/vue/stations-of-account.js";
import { Fake, type Played, playTheVue, openAllTheStations, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const SEEN = "2026-10-26T09:42:00.000Z";
const READ = Date.parse(SEEN) + 1_000;

// L'enregistrement qu'une station publie (runtime/src/enregistrement-station/README.md), tel quel.
const recording = (name: string, platform: string, machine: string, stoppedAt: string | null, lastSeen = SEEN) =>
  JSON.stringify({ brigade: "station-registration", format: 1, name, platform, machine, version: "1.4.0", registeredAt: "2026-10-26T09:00:00.000Z", lastSeen, refreshMs: 120_000, stoppedAt });
// Une station telle que le lecteur du runtime la rend de son gist.
function readEntry(id: string, files: Record<string, string>): StationRecorded {
  const station = stationDuGist(id, files, "chef", READ);
  return "illisible" in station ? assert.fail(station.illisible) : station;
}
const selection = (repositories: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: SEEN });

// La box tourne et sert acme/shop ; le Mac s'est arrêté proprement, et rien ne lui est encore choisi.
const BOX = readEntry("a1b2c3", { [contract.FICHIER_ENREGISTREMENT]: recording("box", "linux", "Linux 6.1.0", null), [contract.FICHIER_SELECTION]: selection(["acme/shop"]) });
const MAC = readEntry("d4e5f6", { [contract.FICHIER_ENREGISTREMENT]: recording("mac", "macos", "macOS 24.1.0", SEEN) });
const LISTED: StationsOfAccount = { state: "listed", stations: [BOX, MAC], unreadable: [] };
const NO_LISTED: StationsOfAccount = { state: "listed", stations: [], unreadable: [], reason: "No station is registered under this GitHub account yet: install brigade's station on a machine, and sign it in to this account." };
const REPOSITORIES = { depots: [{ depot: "acme/shop", base: "main" }, { depot: "acme/site", base: "main" }] };
// Ce que le compte d'un chef atteint d'ordinaire (#1780) : ses quelques projets, mêlés à trente et un dépôts — les siens qui
// ne sont pas des projets, ceux de ses organisations, ceux des autres où il est invité —, dans l'ordre où GitHub les rend.
const OTHERS = Array.from({ length: 31 }, (_, i) => ["acme/notes-", "friend/sandbox-", "asso/site-", "lea/chat-"][i % 4] + String(i).padStart(2, "0"));
const OF_ACCOUNT = { depots: ["acme/shop", ...OTHERS.slice(0, 10), "acme/brigade", ...OTHERS.slice(10, 20), "acme/espace", ...OTHERS.slice(20), "acme/site", "acme/blog"].map((repository) => ({ depot: repository, base: "main" })) };
// Ce `gh` n'a pas de compte ; ou GitHub ne répond pas.
const WITHOUT_ACCOUNT = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
const WITHOUT_NETWORK = echecDeGh("gh", 30_000, { code: 1, message: "Command failed" }, "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n");

// Ce que la vue pose d'après les stations du compte : la ligne de chacune, puis ce que leur lecture dit sous la liste.
function oneBlock(state: StateOfAccount, empty = false) {
  const facts: string[] = [];
  const actions: ActionsOfAccount = {
    ouvrirLaStation: (id) => void facts.push(`ouvrir ${id}`),
    relire: () => void facts.push("relire"),
    seConnecter: () => void facts.push("se connecter"),
    ouvrirLaPage: (url) => void facts.push(`page ${url}`),
    copier: (command) => void facts.push(`copier ${command}`),
  };
  const block = new Fake("div");
  const stations = state.stations?.state === "listed" ? state.stations.stations : [];
  block.append(...stations.map((station) => lineOfTheRecorded(doc, station, actions) as Fake), ...(readOfAccount(doc, state, actions, empty) as Fake[]));
  return { bloc: block, faits: facts, ...readers(block) };
}

// Ce qui se lit du bloc : la ligne d'une station, ses cases, un bouton par son texte, ses lignes en échec.
function readers(block: Fake) {
  const line = (name: string) => block.dessous("button").find((button) => button.className === "ligne" && button.dessous("strong")[0]?.textContent === name) ?? assert.fail(`pas de ligne « ${name} »`);
  const cases = () => block.dessous("input").filter((entry) => entry.type === "checkbox");
  const caseOf = (repository: string) => cases().find((entry) => entry.ariaLabel === repository) ?? assert.fail(`pas de case « ${repository} » : ${cases().map(({ ariaLabel }) => ariaLabel).join(", ")}`);
  const button = (text: string) => block.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » : ${block.dessous("button").map((b) => b.textContent).join(", ")}`);
  const texts = () => block.dessous("p").map((p) => p.textContent);
  const field = () => block.dessous("input").find((entry) => entry.type === "search") ?? assert.fail("pas de champ de recherche");
  const found = () => block.dessous("button").filter(({ className }) => className === "trouve");
  const type = (text: string) => {
    const pose = field();
    pose.value = text;
    pose.declencher("input");
  };
  const inFailure = () => block.dessous("p").filter((p) => p.className === "indisponible");
  const atHover = (pose: Fake) => pose.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel).join("\n");
  return { ligne: line, cases, caseDe: caseOf, bouton: button, textes: texts, enEchec: inFailure, auSurvol: atHover, champ: field, trouves: found, taper: type };
}
const tick = (ticked: Fake, wantedOne: boolean) => {
  ticked.checked = wantedOne;
  ticked.declencher("change");
};

describe("une ligne par machine : appairée, elle se dit par sa présence ; seulement enregistrée, par son enregistrement", () => {
  const pairedOne = (name: string) => ({ nom: name });
  const names = (lines: ReturnType<typeof oneLineByMachine<{ nom: string }>>) => lines.map((line) => ("appairee" in line ? `appairée ${line.appairee.nom}` : `enregistrée ${line.enregistree.name}`));

  test("une machine appairée et enregistrée ne fait qu'une ligne, celle de sa présence, son enregistrement avec elle — même nommée dans une autre casse", () => {
    assert.deepEqual(names(oneLineByMachine([pairedOne("box")], [BOX])), ["appairée box"]);
    assert.deepEqual(oneLineByMachine([pairedOne("Box")], [BOX]), [{ appairee: pairedOne("Box"), enregistree: BOX }]);
    assert.deepEqual(oneLineByMachine([pairedOne("parade-box")], [BOX]), [{ enregistree: BOX }, { appairee: pairedOne("parade-box") }]);
  });

  test("une machine seulement enregistrée a sa ligne, glissée à son nom : les appairées gardent leur ordre", () => {
    const nas = readEntry("e2d4", { [contract.FICHIER_ENREGISTREMENT]: recording("nas", "linux", "Linux 6.1.0", null) });
    const alpha = readEntry("e0a0", { [contract.FICHIER_ENREGISTREMENT]: recording("alpha", "linux", "Linux 6.1.0", null) });
    assert.deepEqual(names(oneLineByMachine([pairedOne("box"), pairedOne("parade-box")], [nas, BOX, MAC, alpha])), ["enregistrée alpha", "appairée box", "enregistrée mac", "enregistrée nas", "appairée parade-box"]);
  });

  test("deux enregistrements d'une même machine n'en font qu'une : celui qui est en ligne, sinon le dernier vu", () => {
    const old = readEntry("0ld", { [contract.FICHIER_ENREGISTREMENT]: recording("mac", "macos", "macOS 24.1.0", "2026-10-20T08:00:00.000Z", "2026-10-20T08:00:00.000Z") });
    const inLine = readEntry("n3w", { [contract.FICHIER_ENREGISTREMENT]: recording("mac", "macos", "macOS 24.1.0", null) });
    assert.deepEqual(oneLineByMachine([], [old, inLine]), [{ enregistree: inLine }]);
    assert.deepEqual(oneLineByMachine([], [MAC, old]), [{ enregistree: MAC }]);
  });
});

describe("appairée et enregistrée : ce qui lui est choisi se fond dans la ligne de sa présence", () => {
  const inLine = (projects: string[]): LineOfStation => lineOfStation(presence("f0b2", "macbook", projects), 0);
  const chosenOne = (repositories: string[] | null): StationRecorded => ({ ...BOX, name: "macbook", selection: repositories });

  test("les projets servis : ceux de sa présence, puis ceux qui lui sont choisis et qu'elle ne nomme pas encore", () => {
    assert.deepEqual(projectsServed([], ["acme/shop"]), ["acme/shop"]);
    assert.deepEqual(projectsServed(["shop", "site"], ["acme/Shop", "acme/blog"]), ["shop", "site", "acme/blog"]);
    assert.deepEqual(projectsServed(["shop"], null), ["shop"]);
  });

  test("sans cuisine dans sa présence mais un projet choisi : elle le sert — ni « runs no kitchen », ni « not added to any project »", () => {
    const without = inLine([]);
    assert.match(without.dit, /runs no kitchen$/);
    assert.equal(without.raison?.cle, "sans-projet");
    const fade = lineFade(without, [], chosenOne(["acme/shop"]));
    assert.equal(fade.dit, "online · idle · acme/shop");
    assert.equal(fade.raison, undefined);
    assert.equal(fade.note, undefined);
    assert.equal(fade.ton, without.ton);
  });

  test("ce qu'elle sert déjà, rien de choisi, ou une ligne qui ne dit pas ses projets : la ligne reste celle de sa présence", () => {
    const withIt = inLine(["shop"]);
    assert.equal(lineFade(withIt, ["shop"], chosenOne(["acme/shop"])), withIt);
    const without = inLine([]);
    assert.equal(lineFade(without, [], chosenOne(null)), without);
    assert.equal(lineFade(without, [], undefined), without);
    assert.deepEqual(lineFade(withIt, ["shop"], chosenOne(["acme/blog"])).dit, "online · idle · shop, acme/blog");
    const unreadable = { dit: "unreadable", raison: reasonOf("illisible", "macbook") };
    assert.equal(lineFade(unreadable, [], chosenOne(["acme/shop"])), unreadable);
  });

  test("hors ligne, elle le reste, sa raison avec : seuls ses projets changent", () => {
    const outsideLine = lineOfStation({ ...presence("f0b2", "macbook", []), etat: "hors-ligne", dit: "offline for 12 min" }, 0);
    const fade = lineFade(outsideLine, [], chosenOne(["acme/shop"]));
    assert.equal(fade.dit, "offline for 12 min · acme/shop");
    assert.equal(fade.raison?.cle, "hors-ligne");
  });
});

describe("la ligne d'une station seulement enregistrée : en ligne ou non, et les projets qu'elle sert", () => {
  test("son nom, en ligne ou non, puis les projets qu'elle sert — ou qu'aucun ne lui est encore choisi", () => {
    const { bloc: block, ligne: line } = oneBlock({ stations: LISTED });
    assert.deepEqual(
      block.dessous("button").filter(({ className }) => className === "ligne").map((pose) => pose.dessous("strong")[0]?.textContent),
      ["box", "mac"],
    );
    assert.match(line("box").textContent, /online · acme\/shop/);
    assert.match(line("mac").textContent, /offline · No project chosen yet./);
    const without = oneBlock({ stations: { ...LISTED, stations: [{ ...BOX, selection: [] }] } });
    assert.match(without.ligne("box").textContent, /online · no project/);
  });

  test("la pastille dit en ligne ou non : un disque vert, un anneau gris — la plateforme, la machine et la version au survol", () => {
    const { ligne: line } = oneBlock({ stations: LISTED });
    const pill = (name: string) => line(name).children.find(({ className }) => className === "pastille") ?? assert.fail("pas de pastille");
    assert.deepEqual([pill("box").dataset.ton, pill("box").dataset.forme], ["vert", "disque"]);
    assert.deepEqual([pill("mac").dataset.ton, pill("mac").dataset.forme], ["gris", "anneau"]);
    assert.match(line("mac").title, /macOS · macOS 24\.1\.0 · version 1\.4\.0 · last sign of life 2026-10-26 09:42 UTC/);
  });

  test("un clic sur une ligne ouvre la page de la station, en ligne ou non — la même flèche, rien ne se déplie", () => {
    const { ligne: line, faits: facts, cases } = oneBlock({ stations: LISTED });
    for (const station of [BOX, MAC]) {
      const one = line(station.name);
      assert.equal(one.ariaExpanded, "", "une ligne n'annonce aucun bloc déplié");
      assert.deepEqual(one.dessous("span").filter(({ className }) => className === "ouvrir").map(({ textContent }) => textContent), ["›"]);
      one.click();
    }
    assert.deepEqual(facts, [`ouvrir ${BOX.id}`, `ouvrir ${MAC.id}`]);
    assert.deepEqual(cases(), [], "aucune ligne ne déplie ses cases");
  });

  test("une registration illisible se dit en une ligne sous la liste, sa raison au survol, et « read again »", () => {
    const { enEchec: inFailure, auSurvol: atHover, bouton: button, faits: facts } = oneBlock({ stations: { ...LISTED, unreadable: [{ id: "f00", reason: "its registration is not JSON" }] } });
    const [line, ...others] = inFailure();
    assert.ok(line !== undefined && others.length === 0);
    assert.equal(line.dessous("span")[0]?.textContent, "1 more station cannot be read");
    assert.match(atHover(line), /f00: its registration is not JSON/);
    button(REREAD).click();
    assert.deepEqual(facts, ["relire"]);
  });

  test("tout listé, rien ne se dit sous la liste : ni titre, ni « read again »", () => {
    const { bloc: block } = oneBlock({ stations: LISTED });
    assert.deepEqual(block.dessous("h3"), []);
    assert.deepEqual(block.dessous("button").filter(({ textContent }) => textContent === REREAD), []);
  });
});

describe("sans aucune station dans la liste : dessous, comment en installer une", () => {
  test("la phrase, puis la commande d'installation de chaque système, que copie un bouton", () => {
    const { bloc: block, textes: texts, faits: facts } = oneBlock({ stations: NO_LISTED }, true);
    // La phrase, puis son aide au survol.
    assert.ok(texts().some((text) => text.startsWith(NO)), texts().join(" | "));
    assert.deepEqual(block.dessous("code").map(({ textContent }) => textContent), INSTALLER.map(({ commande: command }) => command));
    assert.match(INSTALLER[0]?.commande ?? "", /installer-station\.sh \| sh$/);
    assert.match(INSTALLER[1]?.commande ?? "", /installer-station\.ps1 \| iex$/);
    const copy = block.dessous("button").filter(({ textContent }) => textContent === COPY);
    assert.equal(copy.length, 2);
    copy[1]?.click();
    assert.deepEqual(facts, [`copier ${INSTALLER[1]?.commande}`]);
  });

  test("copiée, son bouton le dit ; « read again » relit", () => {
    const { bloc: block, bouton: button, faits: facts } = oneBlock({ stations: NO_LISTED, copiee: INSTALLER[0]?.commande ?? "" }, true);
    assert.deepEqual(block.dessous("button").filter(({ textContent }) => textContent === COPY || textContent === COPIED).map(({ textContent }) => textContent), [COPIED, COPY]);
    button(REREAD).click();
    assert.deepEqual(facts, ["relire"]);
  });

  test("une station appairée dans la liste : rien ne dit d'en installer une", () => {
    assert.deepEqual(oneBlock({ stations: NO_LISTED }, false).bloc.children, []);
  });
});

describe("sous la liste : la lecture en route, la connexion qui manque, la lecture qui échoue", () => {
  test("en lecture, rien ne s'y pose", () => {
    assert.deepEqual(oneBlock({}).bloc.children, []);
  });

  test("sans compte GitHub : la phrase du runtime, et le bouton de la connexion", () => {
    assert.equal(WITHOUT_ACCOUNT.state, "sign-in-required");
    if (WITHOUT_ACCOUNT.state !== "sign-in-required") return;
    const { bouton: button, faits: facts } = oneBlock({ stations: WITHOUT_ACCOUNT });
    button(WITHOUT_ACCOUNT.action.label).click();
    assert.deepEqual(facts, ["se connecter"]);
  });

  test("GitHub injoignable : une ligne, la raison au survol, et « read again »", () => {
    const { enEchec: inFailure, auSurvol: atHover, bouton: button, faits: facts } = oneBlock({ stations: WITHOUT_NETWORK });
    const [line, ...others] = inFailure();
    assert.ok(line !== undefined && others.length === 0);
    assert.equal(line.dessous("span")[0]?.textContent, UNREADABLE);
    assert.match(atHover(line), new RegExp(WITHOUT_NETWORK.reason.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    button(REREAD).click();
    assert.deepEqual(facts, ["relire"]);
  });
});

// La vue jouée entière : l'app, qui a un projet, s'ouvre sur l'accueil — avec, quand ils sont donnés, les stations
// appairées et leurs lignes telles que le process principal les dit (home.ts).
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const startup = (stations?: SeenOfStations, home?: Home) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  ...(stations === undefined ? {} : { stations }),
  ...(home === undefined ? {} : { accueil: home }),
});
// Les stations appairées, et l'accueil qui les dit : chaque ligne écrite par `ligneDeStation`, comme le process principal.
function paired(...stations: StationVue[]): { stations: SeenOfStations; accueil: Home } {
  const lines: LineOfStation[] = stations.map((station) => lineOfStation(station, 0));
  return { stations: { a: SEEN, stations }, accueil: { projets: [], stations: lines, sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } };
}
const presence = (id: string, name: string, projects: string[]): StationVue => ({ id, nom: name, machine: "Debian 12", etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "1.4.0", projets: projects, max: null });

const section = (vue: Played) => vue.element("toutes-les-stations");
// Les lignes de la liste des stations : chaque bouton `ligne`, par le nom qu'il porte.
const linesOf = (vue: Played) => section(vue).dessous("button").filter(({ className }) => className === "ligne");
const namesOf = (vue: Played) => linesOf(vue).map((line) => line.dessous("strong")[0]?.textContent);
async function home(vue: Played) {
  await openAllTheStations(vue);
  return readers(section(vue));
}

describe("la vue jouée : une seule liste de stations, une ligne par machine", () => {
  test("une machine appairée et enregistrée sous le compte ne fait qu'une ligne : celle de sa présence, avec ses projets", async () => {
    // parade-box fait la cuisine de deux projets, mais rien ne lui est choisi sous le compte ; nas n'est qu'enregistrée.
    const box = readEntry("e3e5", { [contract.FICHIER_ENREGISTREMENT]: recording("parade-box", "linux", "Linux 6.1.0", null) });
    const nas = readEntry("e2d4", { [contract.FICHIER_ENREGISTREMENT]: recording("nas", "linux", "Linux 6.1.0", null), [contract.FICHIER_SELECTION]: selection(["acme/shop"]) });
    const { stations, accueil: lines } = paired(presence("f0a1", "parade-box", ["brigade", "espace"]));
    const vue = await playTheVue({ demarrage: () => startup(stations, lines), espace: () => [], stationsDuCompte: () => ({ state: "listed", stations: [nas, box], unreadable: [] }) });
    const readOnes = await home(vue);
    assert.deepEqual(namesOf(vue), ["nas", "parade-box"], "chaque machine, une fois");
    assert.match(readOnes.ligne("parade-box").textContent, /online · idle · brigade, espace/);
    assert.doesNotMatch(section(vue).textContent, /No project chosen yet.|runs no kitchen/, "parade-box sert des projets : rien ne dit le contraire");
    assert.match(readOnes.ligne("nas").textContent, /online · acme\/shop/);
    // Une seule liste : son titre seul (#2638), ni section des stations du compte qui en porterait une seconde.
    assert.deepEqual(section(vue).dessous("h2").map(({ textContent }) => textContent), ["All stations"]);
    assert.deepEqual(section(vue).dessous("h3"), []);
    assert.doesNotMatch(vue.element("tous").textContent, /Under your GitHub account/);
    assert.deepEqual(section(vue).dessous("ul"), []);
  });

  test("une machine appairée sans cuisine, un projet choisi sous le compte : sa ligne dit qu'elle le sert, et la page de la station ne montre aucune case", async () => {
    const mac = readEntry("e1c3", { [contract.FICHIER_ENREGISTREMENT]: recording("macbook-air-de-benoit", "macos", "macOS 24.1.0", null), [contract.FICHIER_SELECTION]: selection(["acme/shop"]) });
    const { stations, accueil: lines } = paired(presence("f0b2", "macbook-air-de-benoit", []));
    const vue = await playTheVue({ demarrage: () => startup(stations, lines), espace: () => [], stationsDuCompte: () => ({ state: "listed", stations: [mac], unreadable: [] }), depotsDuChef: () => REPOSITORIES, choisirLesProjets: async (_id: string, repositories: string[]) => ({ selection: repositories }) });
    const readOnes = await home(vue);
    assert.deepEqual(namesOf(vue), ["macbook-air-de-benoit"]);
    assert.match(readOnes.ligne("macbook-air-de-benoit").textContent, /online · idle · acme\/shop/);
    assert.doesNotMatch(section(vue).textContent, /runs no kitchen|not added to any project|No project chosen yet./);
    assert.deepEqual(readOnes.cases(), [], "fermée, ses cases ne se montrent pas");
    // Toute la ligne ouvre la page de la station, où se cochent ses projets : pas de bouton à côté, rien ne se déplie.
    assert.deepEqual(section(vue).dessous("button").filter(({ textContent }) => textContent === "choose projects"), []);
    readOnes.ligne("macbook-air-de-benoit").click();
    await repos();
    assert.ok(vue.element("station").textContent.includes("macbook-air-de-benoit"));
    // Sa page ne propose rien à cocher : ce qu'elle sert se lit sur la page, et se change depuis l'onglet Stations du projet.
    assert.equal(vue.element("station").dessous("input").length, 0);
  });

  test("toute ligne ouvre la page de sa station : en ligne qui sert des projets, ou hors ligne qui n'en a aucun — aucune ne se déplie", async () => {
    const box = readEntry("e3e5", { [contract.FICHIER_ENREGISTREMENT]: recording("parade-box", "linux", "Linux 6.1.0", null) });
    const nas = readEntry("e2d4", { [contract.FICHIER_ENREGISTREMENT]: recording("nas", "linux", "Linux 6.1.0", SEEN) });
    const outsideLine = { ...presence("f0c3", "vieille-box", []), etat: "hors-ligne" as const, dit: "offline for 12 min" };
    const { stations, accueil: lines } = paired(presence("f0a1", "parade-box", ["brigade"]), outsideLine);
    const vue = await playTheVue({ demarrage: () => startup(stations, lines), espace: () => [], stationsDuCompte: () => ({ state: "listed", stations: [nas, box], unreadable: [] }), depotsDuChef: () => REPOSITORIES });
    await home(vue);
    assert.deepEqual(namesOf(vue), ["nas", "parade-box", "vieille-box"]);
    for (const name of ["parade-box", "vieille-box", "nas"]) {
      const readOnes = readers(section(vue));
      const line = readOnes.ligne(name);
      assert.equal(line.ariaExpanded, "");
      assert.deepEqual(line.dessous("span").filter(({ className }) => className === "ouvrir").map(({ textContent }) => textContent), ["›"], `la flèche de ${name}`);
      line.click();
      await repos();
      assert.equal(vue.element("station").dessous("h2")[0]?.textContent, name, `la page de ${name}`);
      await openAllTheStations(vue);
    }
  });

  test("sans aucune station, ni appairée ni sous le compte, l'accueil dit comment en installer une", async () => {
    const { stations, accueil: lines } = paired();
    const vue = await playTheVue({ demarrage: () => startup(stations, lines), espace: () => [], stationsDuCompte: () => NO_LISTED });
    const readOnes = await home(vue);
    assert.ok(readOnes.textes().some((text) => text.startsWith(NO)));
    assert.equal(section(vue).dessous("code").length, INSTALLER.length);
    assert.ok(!readOnes.textes().some((text) => text.startsWith("no station yet")), "l'absence se dit une fois");
  });

  test("un pont qui ne lit pas les stations du compte ne pose que les stations appairées", async () => {
    const { stations, accueil: lines } = paired(presence("f0a1", "parade-box", ["brigade"]));
    const vue = await playTheVue({ demarrage: () => startup(stations, lines), espace: () => [] });
    await home(vue);
    assert.deepEqual(namesOf(vue), ["parade-box"]);
    assert.equal(section(vue).dessous("section").every(({ hidden }) => hidden), true);
  });
});
