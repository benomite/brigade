// Les stations enregistrées sous le compte GitHub du chef (#1706, épique 1702), dans la liste des stations de l'accueil
// (#1778, épique 1777) : une ligne par machine — une machine appairée se dit par sa présence, et son enregistrement ne
// pose ni seconde ligne, ni section « Under your GitHub account » ; une machine seulement enregistrée a sa ligne, en
// ligne ou non, avec les projets qu'elle sert ; ouverte, les projets du chef à cocher, chaque case écrite aussitôt, et les
// autres dépôts du compte par la recherche seulement (#1780) — jamais leur liste entière ; sans
// station, la commande qui en installe une. Les stations sont écrites par les fonctions mêmes du runtime (`stationDuGist`,
// `echecDeGh`) : ce que la vue pose est ce qu'elle recevra. La vue jouée entière va jusqu'au gist : ce qui est coché est
// écrit selon le contrat (stations-du-account.ts), relu par le lecteur du runtime au lancement suivant, et coché encore.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Home, type LineDeStation, lineDeStation } from "../../src/home.ts";
import { raisonDe } from "../../src/stations/raison.ts";
import { echecDeGh } from "../../../runtime/src/appairage/stations-du-chef.ts";
import * as contract from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { choiceDesProjects, REFUSAL_GITHUB, type StationEnregistree, type StationsDuAccount } from "../../src/stations-du-account.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import {
  AUCUNE,
  COPIEE,
  COPIER,
  ILLISIBLES,
  INSTALLER,
  readDuAccount,
  lineDeLEnregistree,
  lineFondue,
  projectsServed,
  RELIRE,
  uneLineParMachine,
  type StateDuAccount,
  type ActionsDuAccount,
} from "../../src/vue/stations-du-account.js";
import { Faux, type Jouee, jouerLaVue, ouvrirToutesLesStations, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const VU = "2026-10-26T09:42:00.000Z";
const LU = Date.parse(VU) + 1_000;

// L'enregistrement qu'une station publie (runtime/src/enregistrement-station/README.md), tel quel.
const enregistrement = (name: string, platform: string, machine: string, stoppedAt: string | null, lastSeen = VU) =>
  JSON.stringify({ brigade: "station-registration", format: 1, name, platform, machine, version: "1.4.0", registeredAt: "2026-10-26T09:00:00.000Z", lastSeen, refreshMs: 120_000, stoppedAt });
// Une station telle que le lecteur du runtime la rend de son gist.
function lue(id: string, fichiers: Record<string, string>): StationEnregistree {
  const station = stationDuGist(id, fichiers, "chef", LU);
  return "illisible" in station ? assert.fail(station.illisible) : station;
}
const selection = (repositories: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: VU });

// La box tourne et sert acme/shop ; le Mac s'est arrêté proprement, et rien ne lui est encore choisi.
const BOX = lue("a1b2c3", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("box", "linux", "Linux 6.1.0", null), [contract.FICHIER_SELECTION]: selection(["acme/shop"]) });
const MAC = lue("d4e5f6", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("mac", "macos", "macOS 24.1.0", VU) });
const LISTEES: StationsDuAccount = { state: "listed", stations: [BOX, MAC], unreadable: [] };
const AUCUNE_LISTEE: StationsDuAccount = { state: "listed", stations: [], unreadable: [], reason: "No station is registered under this GitHub account yet: install brigade's station on a machine, and sign it in to this account." };
const DEPOTS = { depots: [{ depot: "acme/shop", base: "main" }, { depot: "acme/site", base: "main" }] };
// Ce que le compte d'un chef atteint d'ordinaire (#1780) : ses quelques projets, mêlés à trente et un dépôts — les siens qui
// ne sont pas des projets, ceux de ses organisations, ceux des autres où il est invité —, dans l'ordre où GitHub les rend.
const AUTRES = Array.from({ length: 31 }, (_, i) => ["acme/notes-", "friend/sandbox-", "asso/site-", "lea/chat-"][i % 4] + String(i).padStart(2, "0"));
const DU_ACCOUNT = { depots: ["acme/shop", ...AUTRES.slice(0, 10), "acme/brigade", ...AUTRES.slice(10, 20), "acme/espace", ...AUTRES.slice(20), "acme/site", "acme/blog"].map((repository) => ({ depot: repository, base: "main" })) };
// Ce `gh` n'a pas de compte ; ou GitHub ne répond pas.
const SANS_ACCOUNT = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
const SANS_RESEAU = echecDeGh("gh", 30_000, { code: 1, message: "Command failed" }, "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n");

// Ce que la vue pose d'après les stations du compte : la ligne de chacune, puis ce que leur lecture dit sous la liste.
function unBloc(state: StateDuAccount, empty = false) {
  const facts: string[] = [];
  const actions: ActionsDuAccount = {
    ouvrirLaStation: (id) => void facts.push(`ouvrir ${id}`),
    relire: () => void facts.push("relire"),
    seConnecter: () => void facts.push("se connecter"),
    ouvrirLaPage: (url) => void facts.push(`page ${url}`),
    copier: (command) => void facts.push(`copier ${command}`),
  };
  const bloc = new Faux("div");
  const stations = state.stations?.state === "listed" ? state.stations.stations : [];
  bloc.append(...stations.map((station) => lineDeLEnregistree(doc, station, actions) as Faux), ...(readDuAccount(doc, state, actions, empty) as Faux[]));
  return { bloc, faits: facts, ...lecteurs(bloc) };
}

// Ce qui se lit du bloc : la ligne d'une station, ses cases, un bouton par son texte, ses lignes en échec.
function lecteurs(bloc: Faux) {
  const line = (name: string) => bloc.dessous("button").find((button) => button.className === "ligne" && button.dessous("strong")[0]?.textContent === name) ?? assert.fail(`pas de ligne « ${name} »`);
  const cases = () => bloc.dessous("input").filter((entree) => entree.type === "checkbox");
  const caseDe = (repository: string) => cases().find((entree) => entree.ariaLabel === repository) ?? assert.fail(`pas de case « ${repository} » : ${cases().map(({ ariaLabel }) => ariaLabel).join(", ")}`);
  const button = (texte: string) => bloc.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${bloc.dessous("button").map((b) => b.textContent).join(", ")}`);
  const textes = () => bloc.dessous("p").map((p) => p.textContent);
  const champ = () => bloc.dessous("input").find((entree) => entree.type === "search") ?? assert.fail("pas de champ de recherche");
  const trouves = () => bloc.dessous("button").filter(({ className }) => className === "trouve");
  const taper = (texte: string) => {
    const pose = champ();
    pose.value = texte;
    pose.declencher("input");
  };
  const enFailure = () => bloc.dessous("p").filter((p) => p.className === "indisponible");
  const auSurvol = (pose: Faux) => pose.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel).join("\n");
  return { ligne: line, cases, caseDe, bouton: button, textes, enEchec: enFailure, auSurvol, champ, trouves, taper };
}
const cocher = (coche: Faux, voulue: boolean) => {
  coche.checked = voulue;
  coche.declencher("change");
};

describe("une ligne par machine : appairée, elle se dit par sa présence ; seulement enregistrée, par son enregistrement", () => {
  const appairee = (name: string) => ({ nom: name });
  const noms = (lines: ReturnType<typeof uneLineParMachine<{ nom: string }>>) => lines.map((line) => ("appairee" in line ? `appairée ${line.appairee.nom}` : `enregistrée ${line.enregistree.name}`));

  test("une machine appairée et enregistrée ne fait qu'une ligne, celle de sa présence, son enregistrement avec elle — même nommée dans une autre casse", () => {
    assert.deepEqual(noms(uneLineParMachine([appairee("box")], [BOX])), ["appairée box"]);
    assert.deepEqual(uneLineParMachine([appairee("Box")], [BOX]), [{ appairee: appairee("Box"), enregistree: BOX }]);
    assert.deepEqual(uneLineParMachine([appairee("parade-box")], [BOX]), [{ enregistree: BOX }, { appairee: appairee("parade-box") }]);
  });

  test("une machine seulement enregistrée a sa ligne, glissée à son nom : les appairées gardent leur ordre", () => {
    const nas = lue("e2d4", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("nas", "linux", "Linux 6.1.0", null) });
    const alpha = lue("e0a0", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("alpha", "linux", "Linux 6.1.0", null) });
    assert.deepEqual(noms(uneLineParMachine([appairee("box"), appairee("parade-box")], [nas, BOX, MAC, alpha])), ["enregistrée alpha", "appairée box", "enregistrée mac", "enregistrée nas", "appairée parade-box"]);
  });

  test("deux enregistrements d'une même machine n'en font qu'une : celui qui est en ligne, sinon le dernier vu", () => {
    const ancien = lue("0ld", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("mac", "macos", "macOS 24.1.0", "2026-10-20T08:00:00.000Z", "2026-10-20T08:00:00.000Z") });
    const enLine = lue("n3w", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("mac", "macos", "macOS 24.1.0", null) });
    assert.deepEqual(uneLineParMachine([], [ancien, enLine]), [{ enregistree: enLine }]);
    assert.deepEqual(uneLineParMachine([], [MAC, ancien]), [{ enregistree: MAC }]);
  });
});

describe("appairée et enregistrée : ce qui lui est choisi se fond dans la ligne de sa présence", () => {
  const enLine = (projects: string[]): LineDeStation => lineDeStation(presence("f0b2", "macbook", projects), 0);
  const choisie = (repositories: string[] | null): StationEnregistree => ({ ...BOX, name: "macbook", selection: repositories });

  test("les projets servis : ceux de sa présence, puis ceux qui lui sont choisis et qu'elle ne nomme pas encore", () => {
    assert.deepEqual(projectsServed([], ["acme/shop"]), ["acme/shop"]);
    assert.deepEqual(projectsServed(["shop", "site"], ["acme/Shop", "acme/blog"]), ["shop", "site", "acme/blog"]);
    assert.deepEqual(projectsServed(["shop"], null), ["shop"]);
  });

  test("sans cuisine dans sa présence mais un projet choisi : elle le sert — ni « runs no kitchen », ni « not added to any project »", () => {
    const sans = enLine([]);
    assert.match(sans.dit, /runs no kitchen$/);
    assert.equal(sans.raison?.cle, "sans-projet");
    const fondue = lineFondue(sans, [], choisie(["acme/shop"]));
    assert.equal(fondue.dit, "online · idle · acme/shop");
    assert.equal(fondue.raison, undefined);
    assert.equal(fondue.note, undefined);
    assert.equal(fondue.ton, sans.ton);
  });

  test("ce qu'elle sert déjà, rien de choisi, ou une ligne qui ne dit pas ses projets : la ligne reste celle de sa présence", () => {
    const avec = enLine(["shop"]);
    assert.equal(lineFondue(avec, ["shop"], choisie(["acme/shop"])), avec);
    const sans = enLine([]);
    assert.equal(lineFondue(sans, [], choisie(null)), sans);
    assert.equal(lineFondue(sans, [], undefined), sans);
    assert.deepEqual(lineFondue(avec, ["shop"], choisie(["acme/blog"])).dit, "online · idle · shop, acme/blog");
    const illisible = { dit: "unreadable", raison: raisonDe("illisible", "macbook") };
    assert.equal(lineFondue(illisible, [], choisie(["acme/shop"])), illisible);
  });

  test("hors ligne, elle le reste, sa raison avec : seuls ses projets changent", () => {
    const outsideLine = lineDeStation({ ...presence("f0b2", "macbook", []), etat: "hors-ligne", dit: "offline for 12 min" }, 0);
    const fondue = lineFondue(outsideLine, [], choisie(["acme/shop"]));
    assert.equal(fondue.dit, "offline for 12 min · acme/shop");
    assert.equal(fondue.raison?.cle, "hors-ligne");
  });
});

describe("la ligne d'une station seulement enregistrée : en ligne ou non, et les projets qu'elle sert", () => {
  test("son nom, en ligne ou non, puis les projets qu'elle sert — ou qu'aucun ne lui est encore choisi", () => {
    const { bloc, ligne: line } = unBloc({ stations: LISTEES });
    assert.deepEqual(
      bloc.dessous("button").filter(({ className }) => className === "ligne").map((pose) => pose.dessous("strong")[0]?.textContent),
      ["box", "mac"],
    );
    assert.match(line("box").textContent, /online · acme\/shop/);
    assert.match(line("mac").textContent, /offline · No project chosen yet./);
    const sans = unBloc({ stations: { ...LISTEES, stations: [{ ...BOX, selection: [] }] } });
    assert.match(sans.ligne("box").textContent, /online · no project/);
  });

  test("la pastille dit en ligne ou non : un disque vert, un anneau gris — la plateforme, la machine et la version au survol", () => {
    const { ligne: line } = unBloc({ stations: LISTEES });
    const pill = (name: string) => line(name).children.find(({ className }) => className === "pastille") ?? assert.fail("pas de pastille");
    assert.deepEqual([pill("box").dataset.ton, pill("box").dataset.forme], ["vert", "disque"]);
    assert.deepEqual([pill("mac").dataset.ton, pill("mac").dataset.forme], ["gris", "anneau"]);
    assert.match(line("mac").title, /macOS · macOS 24\.1\.0 · version 1\.4\.0 · last sign of life 2026-10-26 09:42 UTC/);
  });

  test("un clic sur une ligne ouvre la page de la station, en ligne ou non — la même flèche, rien ne se déplie", () => {
    const { ligne: line, faits: facts, cases } = unBloc({ stations: LISTEES });
    for (const station of [BOX, MAC]) {
      const une = line(station.name);
      assert.equal(une.ariaExpanded, "", "une ligne n'annonce aucun bloc déplié");
      assert.deepEqual(une.dessous("span").filter(({ className }) => className === "ouvrir").map(({ textContent }) => textContent), ["›"]);
      une.click();
    }
    assert.deepEqual(facts, [`ouvrir ${BOX.id}`, `ouvrir ${MAC.id}`]);
    assert.deepEqual(cases(), [], "aucune ligne ne déplie ses cases");
  });

  test("une registration illisible se dit en une ligne sous la liste, sa raison au survol, et « read again »", () => {
    const { enEchec: enFailure, auSurvol, bouton: button, faits: facts } = unBloc({ stations: { ...LISTEES, unreadable: [{ id: "f00", reason: "its registration is not JSON" }] } });
    const [line, ...autres] = enFailure();
    assert.ok(line !== undefined && autres.length === 0);
    assert.equal(line.dessous("span")[0]?.textContent, "1 more station cannot be read");
    assert.match(auSurvol(line), /f00: its registration is not JSON/);
    button(RELIRE).click();
    assert.deepEqual(facts, ["relire"]);
  });

  test("tout listé, rien ne se dit sous la liste : ni titre, ni « read again »", () => {
    const { bloc } = unBloc({ stations: LISTEES });
    assert.deepEqual(bloc.dessous("h3"), []);
    assert.deepEqual(bloc.dessous("button").filter(({ textContent }) => textContent === RELIRE), []);
  });
});

describe("sans aucune station dans la liste : dessous, comment en installer une", () => {
  test("la phrase, puis la commande d'installation de chaque système, que copie un bouton", () => {
    const { bloc, textes, faits: facts } = unBloc({ stations: AUCUNE_LISTEE }, true);
    // La phrase, puis son aide au survol.
    assert.ok(textes().some((texte) => texte.startsWith(AUCUNE)), textes().join(" | "));
    assert.deepEqual(bloc.dessous("code").map(({ textContent }) => textContent), INSTALLER.map(({ commande: command }) => command));
    assert.match(INSTALLER[0]?.commande ?? "", /installer-station\.sh \| sh$/);
    assert.match(INSTALLER[1]?.commande ?? "", /installer-station\.ps1 \| iex$/);
    const copier = bloc.dessous("button").filter(({ textContent }) => textContent === COPIER);
    assert.equal(copier.length, 2);
    copier[1]?.click();
    assert.deepEqual(facts, [`copier ${INSTALLER[1]?.commande}`]);
  });

  test("copiée, son bouton le dit ; « read again » relit", () => {
    const { bloc, bouton: button, faits: facts } = unBloc({ stations: AUCUNE_LISTEE, copiee: INSTALLER[0]?.commande ?? "" }, true);
    assert.deepEqual(bloc.dessous("button").filter(({ textContent }) => textContent === COPIER || textContent === COPIEE).map(({ textContent }) => textContent), [COPIEE, COPIER]);
    button(RELIRE).click();
    assert.deepEqual(facts, ["relire"]);
  });

  test("une station appairée dans la liste : rien ne dit d'en installer une", () => {
    assert.deepEqual(unBloc({ stations: AUCUNE_LISTEE }, false).bloc.children, []);
  });
});

describe("sous la liste : la lecture en route, la connexion qui manque, la lecture qui échoue", () => {
  test("en lecture, rien ne s'y pose", () => {
    assert.deepEqual(unBloc({}).bloc.children, []);
  });

  test("sans compte GitHub : la phrase du runtime, et le bouton de la connexion", () => {
    assert.equal(SANS_ACCOUNT.state, "sign-in-required");
    if (SANS_ACCOUNT.state !== "sign-in-required") return;
    const { bouton: button, faits: facts } = unBloc({ stations: SANS_ACCOUNT });
    button(SANS_ACCOUNT.action.label).click();
    assert.deepEqual(facts, ["se connecter"]);
  });

  test("GitHub injoignable : une ligne, la raison au survol, et « read again »", () => {
    const { enEchec: enFailure, auSurvol, bouton: button, faits: facts } = unBloc({ stations: SANS_RESEAU });
    const [line, ...autres] = enFailure();
    assert.ok(line !== undefined && autres.length === 0);
    assert.equal(line.dessous("span")[0]?.textContent, ILLISIBLES);
    assert.match(auSurvol(line), new RegExp(SANS_RESEAU.reason.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    button(RELIRE).click();
    assert.deepEqual(facts, ["relire"]);
  });
});

// La vue jouée entière : l'app, qui a un projet, s'ouvre sur l'accueil — avec, quand ils sont donnés, les stations
// appairées et leurs lignes telles que le process principal les dit (home.ts).
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const demarrage = (stations?: VuDesStations, home?: Home) => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(stations === undefined ? {} : { stations }),
  ...(home === undefined ? {} : { accueil: home }),
});
// Les stations appairées, et l'accueil qui les dit : chaque ligne écrite par `ligneDeStation`, comme le process principal.
function appairees(...stations: StationVue[]): { stations: VuDesStations; accueil: Home } {
  const lines: LineDeStation[] = stations.map((station) => lineDeStation(station, 0));
  return { stations: { a: VU, stations }, accueil: { projets: [], stations: lines, sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } };
}
const presence = (id: string, name: string, projects: string[]): StationVue => ({ id, nom: name, machine: "Debian 12", etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "1.4.0", projets: projects, max: null });

const section = (vue: Jouee) => vue.element("toutes-les-stations");
// Les lignes de la liste des stations : chaque bouton `ligne`, par le nom qu'il porte.
const linesDe = (vue: Jouee) => section(vue).dessous("button").filter(({ className }) => className === "ligne");
const nomsDe = (vue: Jouee) => linesDe(vue).map((line) => line.dessous("strong")[0]?.textContent);
async function home(vue: Jouee) {
  await ouvrirToutesLesStations(vue);
  return lecteurs(section(vue));
}

describe("la vue jouée : une seule liste de stations, une ligne par machine", () => {
  test("une machine appairée et enregistrée sous le compte ne fait qu'une ligne : celle de sa présence, avec ses projets", async () => {
    // parade-box fait la cuisine de deux projets, mais rien ne lui est choisi sous le compte ; nas n'est qu'enregistrée.
    const box = lue("e3e5", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("parade-box", "linux", "Linux 6.1.0", null) });
    const nas = lue("e2d4", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("nas", "linux", "Linux 6.1.0", null), [contract.FICHIER_SELECTION]: selection(["acme/shop"]) });
    const { stations, accueil: lines } = appairees(presence("f0a1", "parade-box", ["brigade", "espace"]));
    const vue = await jouerLaVue({ demarrage: () => demarrage(stations, lines), espace: () => [], stationsDuCompte: () => ({ state: "listed", stations: [nas, box], unreadable: [] }) });
    const lus = await home(vue);
    assert.deepEqual(nomsDe(vue), ["nas", "parade-box"], "chaque machine, une fois");
    assert.match(lus.ligne("parade-box").textContent, /online · idle · brigade, espace/);
    assert.doesNotMatch(section(vue).textContent, /No project chosen yet.|runs no kitchen/, "parade-box sert des projets : rien ne dit le contraire");
    assert.match(lus.ligne("nas").textContent, /online · acme\/shop/);
    // Une seule liste : son titre seul (#2638), ni section des stations du compte qui en porterait une seconde.
    assert.deepEqual(section(vue).dessous("h2").map(({ textContent }) => textContent), ["All stations"]);
    assert.deepEqual(section(vue).dessous("h3"), []);
    assert.doesNotMatch(vue.element("tous").textContent, /Under your GitHub account/);
    assert.deepEqual(section(vue).dessous("ul"), []);
  });

  test("une machine appairée sans cuisine, un projet choisi sous le compte : sa ligne dit qu'elle le sert, et la page de la station ne montre aucune case", async () => {
    const mac = lue("e1c3", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("macbook-air-de-benoit", "macos", "macOS 24.1.0", null), [contract.FICHIER_SELECTION]: selection(["acme/shop"]) });
    const { stations, accueil: lines } = appairees(presence("f0b2", "macbook-air-de-benoit", []));
    const vue = await jouerLaVue({ demarrage: () => demarrage(stations, lines), espace: () => [], stationsDuCompte: () => ({ state: "listed", stations: [mac], unreadable: [] }), depotsDuChef: () => DEPOTS, choisirLesProjets: async (_id: string, depots: string[]) => ({ selection: depots }) });
    const lus = await home(vue);
    assert.deepEqual(nomsDe(vue), ["macbook-air-de-benoit"]);
    assert.match(lus.ligne("macbook-air-de-benoit").textContent, /online · idle · acme\/shop/);
    assert.doesNotMatch(section(vue).textContent, /runs no kitchen|not added to any project|No project chosen yet./);
    assert.deepEqual(lus.cases(), [], "fermée, ses cases ne se montrent pas");
    // Toute la ligne ouvre la page de la station, où se cochent ses projets : pas de bouton à côté, rien ne se déplie.
    assert.deepEqual(section(vue).dessous("button").filter(({ textContent }) => textContent === "choose projects"), []);
    lus.ligne("macbook-air-de-benoit").click();
    await repos();
    assert.ok(vue.element("station").textContent.includes("macbook-air-de-benoit"));
    // Sa page ne propose rien à cocher : ce qu'elle sert se lit sur la page, et se change depuis l'onglet Stations du projet.
    assert.equal(vue.element("station").dessous("input").length, 0);
  });

  test("toute ligne ouvre la page de sa station : en ligne qui sert des projets, ou hors ligne qui n'en a aucun — aucune ne se déplie", async () => {
    const box = lue("e3e5", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("parade-box", "linux", "Linux 6.1.0", null) });
    const nas = lue("e2d4", { [contract.FICHIER_ENREGISTREMENT]: enregistrement("nas", "linux", "Linux 6.1.0", VU) });
    const outsideLine = { ...presence("f0c3", "vieille-box", []), etat: "hors-ligne" as const, dit: "offline for 12 min" };
    const { stations, accueil: lines } = appairees(presence("f0a1", "parade-box", ["brigade"]), outsideLine);
    const vue = await jouerLaVue({ demarrage: () => demarrage(stations, lines), espace: () => [], stationsDuCompte: () => ({ state: "listed", stations: [nas, box], unreadable: [] }), depotsDuChef: () => DEPOTS });
    await home(vue);
    assert.deepEqual(nomsDe(vue), ["nas", "parade-box", "vieille-box"]);
    for (const name of ["parade-box", "vieille-box", "nas"]) {
      const lus = lecteurs(section(vue));
      const line = lus.ligne(name);
      assert.equal(line.ariaExpanded, "");
      assert.deepEqual(line.dessous("span").filter(({ className }) => className === "ouvrir").map(({ textContent }) => textContent), ["›"], `la flèche de ${name}`);
      line.click();
      await repos();
      assert.equal(vue.element("station").dessous("h2")[0]?.textContent, name, `la page de ${name}`);
      await ouvrirToutesLesStations(vue);
    }
  });

  test("sans aucune station, ni appairée ni sous le compte, l'accueil dit comment en installer une", async () => {
    const { stations, accueil: lines } = appairees();
    const vue = await jouerLaVue({ demarrage: () => demarrage(stations, lines), espace: () => [], stationsDuCompte: () => AUCUNE_LISTEE });
    const lus = await home(vue);
    assert.ok(lus.textes().some((texte) => texte.startsWith(AUCUNE)));
    assert.equal(section(vue).dessous("code").length, INSTALLER.length);
    assert.ok(!lus.textes().some((texte) => texte.startsWith("no station yet")), "l'absence se dit une fois");
  });

  test("un pont qui ne lit pas les stations du compte ne pose que les stations appairées", async () => {
    const { stations, accueil: lines } = appairees(presence("f0a1", "parade-box", ["brigade"]));
    const vue = await jouerLaVue({ demarrage: () => demarrage(stations, lines), espace: () => [] });
    await home(vue);
    assert.deepEqual(nomsDe(vue), ["parade-box"]);
    assert.equal(section(vue).dessous("section").every(({ hidden }) => hidden), true);
  });
});
