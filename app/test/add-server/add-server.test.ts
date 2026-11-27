// « Add a server » (#4347, add-server/) : la ligne d'installation d'un serveur, à côté de la liste des stations — l'onglet
// Stations, son choix « Who cooks <projet>? », et la page « who cooks it » d'un projet neuf —, puis le serveur vu arriver
// sous le compte (`stationsDuCompte`), et le projet qui lui est confié par le geste de « Choose who cooks it ».
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { StationRecorded, StationsOfAccount } from "../../src/stations-of-account.ts";
import {
  ADD_A_SERVER,
  PAIRED,
  WAITING,
  INSTALL_COMMAND,
  UNREADABLE,
  WHERE_TO_RUN,
  placeAddServer,
  WHO_COOKS_IT,
  serverSeen,
  ON_A_MAC,
  CHECK_AGAIN,
  type StateOfServer,
} from "../../src/vue/add-server/add-server.js";
import { setJourneyFirstProject } from "../../src/vue/journey-first-project/journey-first-project.js";
import { setTheTabOfStations } from "../../src/vue/stations-tab/stations-tab.js";
import { Fake, playTheVue, type Played, type Answers, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const station = (id: string, name: string, available = true): StationRecorded => ({
  id,
  name,
  platform: "linux",
  machine: "Debian 12",
  version: "1.4.0",
  account: "chef",
  available,
  registeredAt: "2026-11-26T10:00:00.000Z",
  lastSeen: "2026-11-26T10:00:00.000Z",
  stoppedAt: null,
  refreshMs: 120_000,
  selection: null,
});
const LISTED = (stations: StationRecorded[]): StationsOfAccount => ({ state: "listed", stations, unreadable: [] });
const text = (root: Fake) => [...root.descendants()].map((n) => n.textContent).join("\n");
const buttons = (root: Fake) => root.dessous("button").filter(({ hidden }) => !hidden).map(({ textContent }) => textContent);
const button = (root: Fake, wording: string) => root.dessous("button").find((candidate) => candidate.textContent === wording) ?? assert.fail(`pas de « ${wording} » : ${buttons(root).join(", ")}`);
const set = (state: StateOfServer, actions = {}) => {
  const root = new Fake("div");
  root.append(...(placeAddServer(doc, state, actions) as Fake[]));
  return root;
};
// Ce que le panneau demande de taper : chaque `code` qu'il montre.
const commands = (root: Fake) => root.dessous("code").map(({ textContent }) => textContent);

describe("le serveur attendu, d'après la lecture du compte", () => {
  test("une station qui n'était pas là à l'ouverture est le serveur neuf ; sinon il attend", () => {
    const box = station("g1", "box");
    const fresh = station("g9", "parade-box");
    assert.deepEqual(serverSeen(new Set(["g1"]), LISTED([box])), { etat: "attente" });
    assert.deepEqual(serverSeen(new Set(["g1"]), LISTED([box, fresh])), { etat: "appairee", station: fresh });
    assert.deepEqual(serverSeen(new Set(), LISTED([fresh])), { etat: "appairee", station: fresh });
  });

  test("rien de lu, ou celles d'avant pas encore lues : aucune n'est dite neuve", () => {
    assert.deepEqual(serverSeen(new Set(), undefined), { etat: "attente" });
    assert.deepEqual(serverSeen(undefined, LISTED([station("g9", "parade-box")])), { etat: "attente" });
  });

  test("une lecture du compte en échec se dit, sa raison et son détail — jamais « paired »", () => {
    assert.deepEqual(serverSeen(new Set(), { state: "unavailable", cause: "network", reason: "GitHub could not be reached.", detail: "dial tcp" }), { etat: "illisible", raison: "GitHub could not be reached.", detail: "dial tcp" });
    assert.deepEqual(serverSeen(new Set(), { state: "sign-in-required", reason: "Sign in to GitHub.", action: { id: "github-sign-in", label: "Sign in to GitHub", command: ["gh"] } }), { etat: "illisible", raison: "Sign in to GitHub.", detail: "" });
  });
});

describe("le panneau", () => {
  test("la ligne est celle que la page d'installation publie, et la seule", () => {
    const published = /^curl -fsSL \S+\/station\/brigade-station-linux-x64\.tar\.gz \| tar xz && sudo \.\/install\.sh$/m.exec(readFileSync(new URL("../../../docs/installation-station.md", import.meta.url), "utf8"))?.[0];
    assert.equal(INSTALL_COMMAND, published);
  });

  test("fermé, rien que le bouton ; un clic pose le panneau — la phrase, la ligne, « copy », le mot pour un Mac, l'attente — et le dit", () => {
    const toggles: boolean[] = [];
    const root = set({ ouvert: false, vu: { etat: "attente" } }, { basculer: (opened: boolean) => void toggles.push(opened) });
    assert.deepEqual(buttons(root), [ADD_A_SERVER]);
    button(root, ADD_A_SERVER).click();
    for (const sentence of [WHERE_TO_RUN, ON_A_MAC, WAITING]) assert.ok(text(root).includes(sentence), sentence);
    assert.deepEqual(commands(root), [INSTALL_COMMAND]);
    assert.deepEqual(buttons(root), [ADD_A_SERVER, "copy", CHECK_AGAIN]);
    assert.equal(button(root, ADD_A_SERVER).ariaExpanded, "true");
    button(root, ADD_A_SERVER).click();
    assert.deepEqual(toggles, [true, false]);
    assert.equal(button(root, ADD_A_SERVER).ariaExpanded, "false");
  });

  test("« copy » copie la ligne ; « check again » relit le compte", () => {
    const facts: string[] = [];
    const root = set({ ouvert: true, vu: { etat: "attente" }, copiee: true }, { copier: (command: string) => void facts.push(command), verifier: () => void facts.push("verifier") });
    button(root, "copied").click();
    button(root, CHECK_AGAIN).click();
    assert.deepEqual(facts, [INSTALL_COMMAND, "verifier"]);
  });

  test("le serveur arrivé : il le dit, et le projet se confie d'un clic sur son nom — sans projet nommé, rien ne se confie", () => {
    const fresh = station("g9", "parade-box");
    const entrusted: StationRecorded[] = [];
    const root = set({ ouvert: true, vu: { etat: "appairee", station: fresh }, projet: "parade" }, { confier: (one: StationRecorded) => void entrusted.push(one) });
    assert.ok(text(root).includes(PAIRED("parade-box")));
    assert.ok(text(root).includes(WHO_COOKS_IT("parade")));
    assert.ok(!text(root).includes(WAITING));
    assert.equal(button(root, "parade-box").className, "recommande");
    button(root, "parade-box").click();
    assert.deepEqual(entrusted, [fresh]);
    const withoutProject = set({ ouvert: true, vu: { etat: "appairee", station: fresh } }, { confier: () => assert.fail("rien à confier") });
    assert.ok(text(withoutProject).includes(PAIRED("parade-box")));
    assert.deepEqual(buttons(withoutProject), [ADD_A_SERVER, "copy"]);
  });

  test("hors ligne, le serveur se choisit sans être recommandé", () => {
    const root = set({ ouvert: true, vu: { etat: "appairee", station: station("g9", "parade-box", false) }, projet: "parade" }, { confier: () => {} });
    assert.equal(button(root, "parade-box").className, "");
  });

  test("la lecture du compte en échec : une ligne, sa raison ; « check again » reste", () => {
    const root = set({ ouvert: true, vu: { etat: "illisible", raison: "GitHub could not be reached.", detail: "dial tcp" } });
    assert.ok(text(root).includes(`${UNREADABLE}: GitHub could not be reached.`));
    assert.ok(!text(root).includes(WAITING));
    // Le « ? » de la ligne porte le détail au survol.
    assert.deepEqual(buttons(root), [ADD_A_SERVER, "copy", "?", CHECK_AGAIN]);
  });
});

// Critère 2 du ticket : sur chaque écran qui l'offre, le panneau ouvert ne demande de taper que la ligne montrée, et ne
// renvoie à aucune page d'installation.
describe("aucune autre commande, aucune page d'installation, sur chaque écran qui l'offre", () => {
  const ACTIONS = { choisirQuiCuit() {}, deplacer() {}, versIci() {}, cuireIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
  const BASE = { projet: "parade", poste: "this Mac", lues: true, haut: { etat: "personne", vert: false }, servantes: [], deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set(), quiCuit: true };
  const OPEN: StateOfServer = { ouvert: true, vu: { etat: "attente" }, projet: "parade" };
  const withoutOther = (root: Fake) => {
    assert.ok(text(root).includes(INSTALL_COMMAND));
    assert.deepEqual(commands(root), [INSTALL_COMMAND]);
    // The one line itself carries its `sudo`: what is refused is any other command around it.
    assert.doesNotMatch(text(root).replaceAll(INSTALL_COMMAND, ""), /installation-station|installer-station\.ps1|\birm\b|\bssh\b|\bsudo\b/i);
  };

  test("l'onglet Stations : sous la ligne du haut, dont les gestes s'effacent tant que le panneau est ouvert", () => {
    const closes = setTheTabOfStations(doc as never, BASE as never, ACTIONS as never) as Fake;
    assert.deepEqual(buttons(closes), ["Choose who cooks it", ADD_A_SERVER]);
    const opened = setTheTabOfStations(doc as never, { ...BASE, serveur: OPEN } as never, ACTIONS as never) as Fake;
    assert.deepEqual(buttons(opened), [ADD_A_SERVER, "copy", CHECK_AGAIN]);
    withoutOther(opened);
  });

  test("le choix « Who cooks parade? » : sous sa liste", () => {
    const choice = { titre: "Who cooks parade?", choix: [{ cle: "ici", nom: "this computer", horsLigne: false, recommande: true }], deplacement: false };
    const root = setTheTabOfStations(doc as never, { ...BASE, choix: choice, serveur: OPEN } as never, ACTIONS as never) as Fake;
    assert.deepEqual(buttons(root), ["this computer", "Cancel", ADD_A_SERVER, "copy", CHECK_AGAIN]);
    withoutOther(root);
  });

  test("la page « who cooks it » d'un projet neuf : sous ses choix", () => {
    const root = setJourneyFirstProject(
      doc as never,
      { depot: "chef/parade", vu: { etape: "station" }, progression: "1 of 2: who cooks it", station: "a-faire", choix: [{ cle: "ici", nom: "this computer", horsLigne: false, recommande: true }], serveur: OPEN },
      { choisir() {}, relire() {}, preparer() {}, ouvrirLaCarte() {} },
    ) as Fake;
    assert.deepEqual(buttons(root), ["this computer", ADD_A_SERVER, "copy", CHECK_AGAIN]);
    withoutOther(root);
  });
});

// La page d'un projet neuf, jouée : « Add a project », le dépôt chef/cantine, puis « who cooks it ».
const PATH = "/home/chef/.config/brigade/app.json";
const A = "2026-11-26T10:04:12.000Z";
const REPOSITORY = "chef/cantine";
const FACTS: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] } as never;
async function thePageOfCantine(answers: Answers) {
  let vue: Played | undefined;
  vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: PATH, projets: [] }),
      poste: { nom: "this computer", mac: false },
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    }),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "chef" }),
    depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
    ouvrirDUneStation: (name, repository, base) => {
      vue?.dire("surConfiguration", forTheBar({ chemin: PATH, projets: [{ nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
      return { state: "open", project: name, repository: repository, folder: `/home/chef/Brigade/${name}`, cloned: true };
    },
    projetsServis: () => ({ depots: [] }),
    espace: () => [],
    departDuProjet: () => ({ aucune: true }),
    checkRepoSetup: () => ({ ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] }),
    ...answers,
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  button(vue.element("ajout"), REPOSITORY).click();
  await repos();
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const question = (vue: Played) => vue.element("parcours-premier-projet");

describe("la page « who cooks it » d'un projet neuf, jouée", () => {
  test("« Add a server », le serveur vu arriver à « check again », puis confié d'un clic : la page passe à la mise en place", async () => {
    let stations = [station("g1", "atelier", false)];
    const chosen: [string, string[]][] = [];
    const vue = await thePageOfCantine({ stationsDuCompte: () => LISTED(stations), choisirLesProjets: (id, repositories) => (chosen.push([id, repositories]), { selection: repositories }) });
    button(question(vue), ADD_A_SERVER).click();
    await repos();
    assert.ok(text(question(vue)).includes(INSTALL_COMMAND));
    assert.ok(text(question(vue)).includes(WAITING));
    stations = [...stations, station("g9", "parade-box")];
    button(question(vue), CHECK_AGAIN).click();
    await repos();
    assert.ok(text(question(vue)).includes(PAIRED("parade-box")));
    assert.ok(!text(question(vue)).includes(PAIRED("atelier")), "a station known before is not the new server");
    // La liste du haut le propose aussi, relue ; le panneau le confie.
    const panel = question(vue).dessous("section").find(({ className }) => className === "ajout-de-serveur") ?? assert.fail("pas de panneau");
    button(panel, "parade-box").click();
    await repos();
    assert.deepEqual(chosen, [["g9", [REPOSITORY]]]);
    assert.equal(vue.element("main").dataset.parcours, "setup");
  });

  test("la lecture du compte qui échoue se dit dans le panneau : rien n'est dit arrivé", async () => {
    let fails = false;
    const vue = await thePageOfCantine({
      stationsDuCompte: () => {
        if (fails) throw new Error("gh: dial tcp: i/o timeout");
        return LISTED([]);
      },
    });
    button(question(vue), ADD_A_SERVER).click();
    await repos();
    fails = true;
    button(question(vue), CHECK_AGAIN).click();
    await repos();
    assert.match(text(question(vue)), /your stations could not be read: Your stations could not be read/);
    assert.ok(!text(question(vue)).includes("checked in"));
  });
});
