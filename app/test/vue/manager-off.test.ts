// Le projet éteint, dit honnêtement (#3454) : la vue du projet — la tête du rail — le dit en une ligne, à côté du bouton qui
// l'allume, le geste de l'interrupteur (`switch on`) ; allumé, ni la ligne ni le bouton. L'onglet Stations ne dit jamais
// « cooks this project » d'un projet éteint : sa ligne du haut dit qu'il est éteint ; allumé, elle dit qui le cuit, comme
// avant. Les deux suivent la bande dès qu'elle dit le projet allumé, sans rien recharger. L'état vient de la bande
// (alerts.ts), lue dans ce que `manager` écrit : la commande du runtime, jouée ici sur un vrai journal.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import { principal as manager } from "../../../runtime/src/manager-cli.ts";
import type { Home } from "../../src/home.ts";
import { MANAGER_OFF, holdBands, type Band } from "../../src/alerts.ts";
import { POWER_UP, tell } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import type { Reading } from "../../src/box.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { confirmationOf } from "../../src/confirmation.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { OFF, topOf, sentenceOfTop, type Serving } from "../../src/vue/stations-tab/state.js";
import { ADD } from "../../src/vue/stations-tab/stations-tab.js";
import { type Fake, type Played, playTheVue, openTab, type Answers, repos } from "../helpers/false-vue.ts";

const A = "2026-10-13T10:00:01.000Z";
const KITCHEN = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const reading = (command: string, text: string): Reading => ({ projet: "parade", demande: 1, a: A, sorties: [{ commande: command, texte: text }] });

// `manager`, jouée sur un journal où le chef a allumé, ou éteint, le projet à 9 h 25 : sa sortie, telle quelle.
function outputOfManager(t: TestContext, lit: boolean): string {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-manager-eteint-"));
  const log = ouvrirJournal(directory, { maintenant: () => new Date("2026-10-13T09:25:00.000Z") });
  t.after(() => {
    log.fermer();
    rmSync(directory, { recursive: true, force: true });
  });
  const done: Fait = { type: lit ? "project.switched-on" : "project.switched-off", payload: {} };
  log.ajouter({ project: "parade", ticket: null, author: "chef", ...done });
  const lines: string[] = [];
  void manager({ args: [], env: { BRIGADE_STATE_DIR: directory }, dire: (line) => void lines.push(line), redire: (line) => assert.fail(line) });
  return `${lines.join("\n")}\n`;
}

// La bande que le process principal dirait, `manager` lu — ou pas encore.
function bandRead(output?: string): Band {
  const bands = holdBands({ etablir: 1, minimum: 0 });
  const [openOne] = bands.ouvrir(["parade"]);
  return output === undefined ? (openOne ?? assert.fail("pas de bande")) : bands.manager(reading("manager", output));
}

const FACTS: Facts = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
};

// La box sert parade, en ligne ; ce Mac ne le sert pas.
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const ON_THE_BOX: ProjectSeen = { nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [{ id: "gbox", nom: "parade-box", etat: "servi", dit: "", autoriser: [] }], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const SEEN: SeenOfProjects = { a: A, projets: [ON_THE_BOX], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposed(BOX), gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };

async function open(answers: Answers = {}, stations: StationVue[] = [BOX, MAC]): Promise<Played> {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: SEEN,
    }),
    espace: () => [],
    ...answers,
  });
  vue.element("projets").children[1]?.click();
  await repos();
  const receivedOne = holdFacts().recevoir(reading("facts", JSON.stringify(FACTS)));
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const TURN_ON = "switch the project on…";
const headOfRail = (vue: Played): Fake | undefined => vue.element("rail").dessous("p").find(({ className }) => className === "arret-manager");
const turnOn = (vue: Played): Fake | undefined => vue.element("rail").dessous("button").find(({ textContent }) => textContent === TURN_ON);
const toggle = (vue: Played): Fake => vue.element("interrupteur-projet").dessous("button").find(({ className }) => className === "bascule") ?? assert.fail("pas d'interrupteur");
const actionsGone = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "geste").map(({ args }) => args);
const tab = (vue: Played) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const top = (vue: Played) => tab(vue).children.find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const sentence = (vue: Played) => top(vue).dessous("p").find(({ className }) => className === "phrase")?.dessous("strong")[0]?.textContent ?? "";

describe("la vue du projet, le projet éteint : une ligne, et le bouton qui l'allume (#3454)", () => {
  test("éteint : la tête du rail dit qu'il est éteint, et « switch the project on… » est à côté, sur la même ligne", async (t) => {
    const vue = await open();
    vue.dire("surAlertes", bandRead(outputOfManager(t, false)));
    await repos();
    const head = headOfRail(vue) ?? assert.fail("la vue du projet ne dit pas le projet éteint");
    assert.equal(head.dessous("strong")[0]?.textContent, MANAGER_OFF);
    const button = turnOn(vue) ?? assert.fail("pas de bouton qui allume le projet");
    assert.ok(head.dessous("button").includes(button), "le bouton n'est pas sur la ligne qui dit le projet éteint");
    assert.equal(vue.element("rail").dessous("p").filter(({ className }) => className === "arret-manager").length, 1);
    // La ligne `manager` de la box, mot pour mot, au survol de la ligne.
    assert.match(head.title, /^OFF since 2026-10-13T09:25:00\.000Z \(by chef\)/);
  });

  test("allumé : ni la ligne ni le bouton ; pas encore lu non plus — ce n'est pas « éteint »", async (t) => {
    const vue = await open();
    vue.dire("surAlertes", bandRead());
    await repos();
    assert.equal(headOfRail(vue), undefined);
    assert.equal(turnOn(vue), undefined);

    vue.dire("surAlertes", bandRead(outputOfManager(t, true)));
    await repos();
    assert.equal(headOfRail(vue), undefined);
    assert.equal(turnOn(vue), undefined);
    assert.doesNotMatch(vue.element("rail").textContent, /project off/);
  });

  test("le bouton l'allume : sa confirmation s'ouvre sous la ligne, « yes » fait partir `switch on`, et la vue passe à allumé sans rien recharger", async (t) => {
    const backlog = { ouvertes: 3, retenues: 0 };
    const vue = await open({
      confirmer: (_, id) => confirmationOf(id, PARADE, { sans: "pas lus" }, KITCHEN),
      compter: () => ({ projet: "parade", a: A, ...backlog, dit: tell(backlog) }),
      geste: () => undefined,
    });
    vue.dire("surAlertes", bandRead(outputOfManager(t, false)));
    await repos();

    (turnOn(vue) ?? assert.fail("pas de bouton")).click();
    await repos();
    // Le geste de l'interrupteur, le même : rien ne part avant le « oui ».
    assert.deepEqual(vue.dernier("confirmer"), ["parade", "projet-allumer"]);
    assert.deepEqual(actionsGone(vue), []);
    const openOne = vue.element("rail").dessous("section").find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation sous la ligne");
    assert.match(openOne.textContent, /it will judge the 3 open issues/);
    (openOne.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(actionsGone(vue), [["parade", "projet-allumer", true]]);

    // La bande relue dit le projet allumé : la ligne et le bouton partent, l'interrupteur dit « project on ».
    vue.dire("surAlertes", bandRead(outputOfManager(t, true)));
    await repos();
    assert.equal(headOfRail(vue), undefined);
    assert.equal(turnOn(vue), undefined);
    assert.equal(toggle(vue).textContent, "project on");
  });
});

describe("l'onglet Stations, le projet éteint : jamais « cooks this project » (#3454)", () => {
  test("éteint, sa box en ligne : la ligne du haut dit le projet éteint, en gris, et où l'allumer au survol — ni « Cooked by » ni « cooks this project »", async (t) => {
    const vue = await open();
    vue.dire("surAlertes", bandRead(outputOfManager(t, false)));
    await repos();
    await openTab(vue, "Stations");
    assert.equal(sentence(vue), "Project off — nothing new is taken, split or merged");
    assert.equal(top(vue).dataset.etat, "eteint");
    assert.equal(top(vue).dataset.ton, "gris");
    assert.doesNotMatch(tab(vue).textContent, /cooks this project|Cooked by/);
    assert.match(top(vue).dessous("button").find(({ className }) => className === "aide")?.ariaLabel ?? "", /OFF since[\s\S]*switch the project on/);
    // Ses stations restent à régler : « Add a station », comme quand il cuit.
    assert.deepEqual(top(vue).dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent), [ADD]);
  });

  test("éteint, sa box hors ligne : toujours le projet éteint, jamais « parade-box cooks this project, but… »", async (t) => {
    const vue = await open({}, [{ ...BOX, etat: "hors-ligne", dit: "offline for 3 h" }, MAC]);
    vue.dire("surAlertes", bandRead(outputOfManager(t, false)));
    await repos();
    await openTab(vue, "Stations");
    assert.equal(top(vue).dataset.etat, "eteint");
    assert.doesNotMatch(tab(vue).textContent, /cooks this project/);
  });

  test("allumé, ou pas encore lu : « Cooked by parade-box », comme avant ; allumé sous les yeux du chef, l'onglet passe d'éteint à cuit sans rien recharger", async (t) => {
    const vue = await open();
    vue.dire("surAlertes", bandRead());
    await repos();
    await openTab(vue, "Stations");
    assert.match(sentence(vue), /^Cooked by parade-box · online/);

    vue.dire("surAlertes", bandRead(outputOfManager(t, false)));
    await repos();
    assert.equal(top(vue).dataset.etat, "eteint");

    vue.dire("surAlertes", bandRead(outputOfManager(t, true)));
    await repos();
    assert.equal(top(vue).dataset.etat, "cuit");
    assert.equal(top(vue).dataset.ton, "vert");
    assert.match(sentence(vue), /^Cooked by parade-box · online/);
  });

  test("la ligne du haut : éteint l'emporte sur cuit, hors ligne et personne ; un déménagement en route l'emporte sur éteint", () => {
    const servingOne = (state: Serving["etat"]): Serving => ({ id: "gbox", nom: "parade-box", ici: false, sorte: "box", etat: state, dit: state === "en-ligne" ? "online" : "offline for 3 h", cooks: [], agents: [] });
    const switchedOff = { dit: MANAGER_OFF, releve: "OFF since …" };
    for (const servingOnes of [[servingOne("en-ligne")], [servingOne("hors-ligne")], []]) {
      const without = topOf({ servantes: servingOnes, deplacement: null, maintenant: 0 });
      assert.match(sentenceOfTop(without), /cooks this project|Cooked by/);
      const off = topOf({ servantes: servingOnes, deplacement: null, maintenant: 0, eteint: switchedOff });
      assert.deepEqual(off, { etat: "eteint", vert: false, dit: MANAGER_OFF, releve: "OFF since …", servi: servingOnes.length > 0 });
      assert.equal(sentenceOfTop(off), OFF(MANAGER_OFF));
      assert.doesNotMatch(sentenceOfTop(off), /cooks this project|Cooked by/);
    }
    const displacement = { de: "parade-box", vers: "macbook", depuis: 0, etape: "demandee" as const, dit: "", deEnLigne: true, versEnLigne: true };
    assert.equal(topOf({ servantes: [servingOne("en-ligne")], deplacement: displacement, maintenant: 0, eteint: switchedOff }).etat, "deplacement");
  });
});
