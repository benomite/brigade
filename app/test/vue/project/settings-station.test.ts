// Les réglages de chaque station, sur l'onglet Stations (#2488, épique #2484) : pour chacune, son plafond de cooks, ses
// capacités, et si elle prend les tickets ordinaires, chacun avec son niveau. Un changement fait
// ici s'applique dès que son contrôle change — aucun « Save » (#2920) — et part par le stockage qui existe déjà — la déclaration des stations (`changerUneStation`), l'option des tickets
// ordinaires de ce poste (`reglerOrdinaires`) — et se relit tel quel quand l'app est relancée : le faux pont de ce test
// tient ce stockage, comme le process principal. La vue jouée telle qu'elle est, devant un faux document
// (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { blockOfOrdinary, type FactsStation } from "../../../src/ordinary.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { Guide, StationChanged, StationsRead, StationWanted } from "../../../src/service.ts";
import { LEVELS_SAID } from "../../../src/vue/levels.js";
import { ORDINARY_OF_ELSEWHERE, settingsOfTheStation, SETTINGS, inputOf } from "../../../src/vue/project/stations/StationSettings.js";
import { STOP, YES_STOP } from "../../../src/vue/stations-tab/stations-tab.js";
import { APPLIES } from "../../../src/vue/stations-declared.js";
import { Fake, type Played, playTheVue, openTab, repos } from "../../helpers/false-vue.ts";

const A = "2026-11-05T10:04:12.000Z";
const PARADE = "parade";

// Ce que le process principal garde, d'un lancement de l'app à l'autre : la déclaration des stations du projet, que sa
// station principale tient, et l'option des tickets ordinaires de ce poste, dans le fichier des projets.
type Storage = { stations: StationsRead; projet: Project };
const storage = (): Storage => ({
  stations: {
    proposees: [],
    absent: null,
    declarees: [
      { nom: "mac/claude", moteur: "claude", fournit: ["code", "macos"], cooks: 2, distante: false },
      { nom: "pc/claude", moteur: "claude", fournit: ["code", "navigateur-headless"], cooks: 1, distante: true },
    ],
  },
  projet: { nom: PARADE, dossier: "/tmp/parade", limiteCooks: 2 },
});

// Ce que `facts` dit des stations : pc/claude prend aussi les tickets ordinaires.
const station = (name: string, remote: boolean, ordinary: boolean): FactsStation => ({ station: name, distante: remote, plafond: null, ordinaires: ordinary, bacASable: null, prendOrdinaires: ordinary, cuisson: "cooking", cooks: [] });
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-11-05T10:04:11.000Z",
  dernierTick: "2026-11-05T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  stations: [station("mac/claude", false, false), station("pc/claude", true, true)],
};

const guide = (stations: StationsRead): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start: the station of this computer runs with the app" },
  termine: true,
  controle: { a: A, stations },
});

const startup = (project: Project) => () => ({
  // « parade » cuit sur ce poste : sa station de la box est celle de ce Mac.
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [project] }, () => true, (name) => name === PARADE),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// Le faux process principal : il lit et écrit `tenu`, comme main.ts et service.ts lisent et écrivent leur stockage.
function change(held: Storage, name: string, wanted: StationWanted): StationChanged {
  const declaredEntries = held.stations.declarees;
  // Comme service.ts : un plafond hors de 1 à 99 est refusé, rien n'est écrit.
  if (!("retiree" in wanted) && (wanted.cooks < 1 || wanted.cooks > 99)) return { refus: `Nothing was saved: how many cooks ${name} runs at once is a whole number, from 1 to 99.` };
  if ("retiree" in wanted) held.stations = { ...held.stations, declarees: declaredEntries.filter((readEntry) => readEntry.nom !== name) };
  else held.stations = { ...held.stations, declarees: declaredEntries.map((readEntry) => (readEntry.nom === name ? { ...readEntry, cooks: wanted.cooks, fournit: [...wanted.fournit] } : readEntry)) };
  return { fait: "retiree" in wanted ? `${name} no longer serves ${PARADE}` : `${name} saved` };
}

// Un lancement de l'app : « parade » ouverte, ses faits lus, l'onglet Stations montré. `retenir` : le faux process
// principal garde sa réponse à `changerUneStation` jusqu'à ce que le test la lâche.
async function launch(held: Storage, retain?: Promise<void>): Promise<Played> {
  const vue = await playTheVue({
    demarrage: startup(held.projet),
    espace: () => [],
    service: () => guide(held.stations),
    ordinaires: () => blockOfOrdinary(held.projet, "darwin", FACTS.stations, true),
    reglerOrdinaires: (_, active, limit) => {
      held.projet = { ...held.projet, ordinaires: active, ...(limit === null ? {} : { limiteCooks: limit }) };
      return undefined;
    },
    changerUneStation: async (_, name, wanted) => {
      if (retain !== undefined) await retain;
      return change(held, name, wanted);
    },
    lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await openTab(vue, "Stations");
  return vue;
}

// L'onglet Stations (#3195) : les réglages d'une station déclarée sont dans « Details » de sa carte.
const block = (vue: Played) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const set = (vue: Played) => block(vue).dessous("section").filter(({ className }) => className === "station-reglee");
const stationOf = (vue: Played, name: string) => set(vue).find(({ dataset }) => dataset.station === name) ?? assert.fail(`pas de réglages pour ${name}`);
const cardOf = (vue: Played, name: string) => block(vue).dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === name) ?? assert.fail(`pas de carte pour ${name}`);
const lineOf = (pose: Fake, key: string) => pose.children.find(({ className, dataset }) => className === "reglage" && dataset.cle === key) ?? assert.fail(`pas de ligne « ${key} »`);
const switchOf = (line: Fake) => line.dessous("button").find(({ role }) => role === "switch") ?? assert.fail("pas d'interrupteur");
const lit = (line: Fake) => switchOf(line).ariaChecked === "true";
const buttonOf = (pose: Fake, text: string) => pose.dessous("button").find(({ textContent }) => textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
const fieldOf = (pose: Fake) => lineOf(pose, "cooks").dessous("input")[0] ?? assert.fail("pas de champ");
// Ce qu'une rangée dit sous elle : ce que son dernier changement a rendu.
const saysUnder = (line: Fake) => line.children.filter(({ className }) => className.startsWith("dit")).map(({ className, textContent }) => [className, textContent]);

// Une station telle que l'écran la dit : chaque réglage, son niveau, sa valeur, et s'il se change d'ici.
const readOne = (pose: Fake) =>
  pose.children
    .filter(({ className }) => className === "reglage")
    .map((line) => {
      const [name, value, field] = line.children;
      const level = name?.children.find(({ className }) => className === "niveau");
      const entries = [...(field?.dessous("input") ?? []), ...(field?.dessous("button") ?? []).filter(({ role }) => role === "switch")];
      return {
        cle: line.dataset.cle,
        nom: name?.textContent.replace(level?.textContent ?? "", ""),
        niveau: level?.textContent,
        valeur: value?.children[0]?.textContent,
        reglable: entries.some(({ disabled }) => !disabled),
      };
    });

describe("l'onglet Stations : les réglages de chaque station (#2488), dans « Details » de sa carte (#3195)", () => {
  test("pour chaque station, les trois réglages, chacun avec son niveau, et ce qui se change d'ici", async () => {
    const vue = await launch(storage());
    const machine = LEVELS_SAID.machine.libelle;
    assert.deepEqual(
      set(vue).map(({ dataset }) => dataset.station),
      ["mac/claude", "pc/claude"],
    );
    // Chacune dans « Details » de sa carte, replié tant que le chef ne l'ouvre pas.
    for (const name of ["mac/claude", "pc/claude"]) assert.equal((cardOf(vue, name).dessous("details")[0] as unknown as { open?: boolean } | undefined)?.open, false);
    assert.equal(block(vue).textContent.includes("not read yet"), false);
    assert.deepEqual(readOne(stationOf(vue, "mac/claude")), [
      { cle: "cooks", nom: "cooks at once", niveau: machine, valeur: "2 cooks at once", reglable: true },
      { cle: "capacites", nom: "what it provides", niveau: machine, valeur: "code, macos", reglable: true },
      { cle: "ordinaires", nom: "ordinary tickets", niveau: machine, valeur: "not taken", reglable: true },
    ]);
    // pc/claude joue ailleurs : ses tickets ordinaires sont ce que `facts` dit d'elle, et le survol dit pourquoi ils ne se
    // changent pas d'ici.
    const pc = stationOf(vue, "pc/claude");
    assert.deepEqual(readOne(pc), [
      { cle: "cooks", nom: "cooks at once", niveau: machine, valeur: "1 cook at once", reglable: true },
      { cle: "capacites", nom: "what it provides", niveau: machine, valeur: "code, navigateur-headless", reglable: true },
      { cle: "ordinaires", nom: "ordinary tickets", niveau: machine, valeur: "taken", reglable: false },
    ]);
    assert.equal(lit(lineOf(pc, "ordinaires")), true);
    assert.equal(switchOf(lineOf(pc, "ordinaires")).disabled, true);
    assert.ok(lineOf(pc, "ordinaires").dessous("button").some(({ ariaLabel }) => ariaLabel === ORDINARY_OF_ELSEWHERE));
    // Les cases des capacités : celles de chaque station du projet, cochées comme elle les déclare.
    const ticked = (pose: Fake) => lineOf(pose, "capacites").dessous("input").filter(({ type, checked }) => type === "checkbox" && checked).map(({ ariaLabel }) => ariaLabel);
    assert.deepEqual(ticked(pc), ["code", "navigateur-headless"]);
    assert.deepEqual(SETTINGS.map(({ cle: key }) => key), ["cooks", "capacites", "ordinaires"]);
    // Servir le projet n'est pas une rangée de ses réglages : l'arrêter est sur sa carte (« Stop cooking here »), et nulle part ailleurs.
    assert.deepEqual(set(vue).flatMap((pose) => pose.dessous("button")).filter(({ textContent }) => /remove|stop/i.test(textContent)), []);
    assert.deepEqual(set(vue).flatMap((pose) => pose.dessous("input")).filter(({ ariaLabel }) => /serves/.test(ariaLabel ?? "")), []);
  });

  test("aucun « Save » : le bloc n'a que ses contrôles, et rien ne part tant qu'aucun ne change", async () => {
    const vue = await launch(storage());
    assert.deepEqual(block(vue).dessous("button").filter(({ textContent }) => /^(save|saving…)$/i.test(textContent)), []);
    // Le champ tapé sans être quitté n'envoie rien ; quitté à la même valeur non plus.
    const cooks = fieldOf(stationOf(vue, "pc/claude"));
    cooks.value = "3";
    cooks.declencher("input");
    cooks.value = "1";
    cooks.declencher("change");
    await repos();
    assert.equal(vue.appels.some(({ geste: action }) => action === "changerUneStation"), false);
  });

  test("le plafond et les capacités changés ici s'appliquent aussitôt, et se relisent tels quels à la relance de l'app", async () => {
    const held = storage();
    const vue = await launch(held);
    // Le plafond, dès que son champ change : la déclaration entière de la station part, ce plafond dedans.
    const cooks = fieldOf(stationOf(vue, "pc/claude"));
    cooks.value = "4";
    cooks.declencher("input");
    cooks.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { cooks: 4, fournit: ["code", "navigateur-headless"] }]);
    assert.deepEqual(saysUnder(lineOf(stationOf(vue, "pc/claude"), "cooks")), [["dit fait", "pc/claude saved"]]);
    // La déclaration relue arrive par le contrôle suivant.
    vue.dire("surGuide", guide(held.stations));
    await repos();
    assert.equal(readOne(stationOf(vue, "pc/claude"))[0]?.valeur, "4 cooks at once");
    // Une case cochée part aussitôt, elle aussi, le plafond en vigueur dedans ; ce qu'elle a rendu se lit sous sa rangée.
    const macos = lineOf(stationOf(vue, "pc/claude"), "capacites").dessous("input").find(({ ariaLabel }) => ariaLabel === "macos") ?? assert.fail("pas de case macos");
    macos.checked = true;
    macos.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { cooks: 4, fournit: ["code", "navigateur-headless", "macos"] }]);
    assert.deepEqual(saysUnder(lineOf(stationOf(vue, "pc/claude"), "capacites")), [["dit fait", "pc/claude saved"]]);
    assert.deepEqual(saysUnder(lineOf(stationOf(vue, "pc/claude"), "cooks")), []);
    vue.dire("surGuide", guide(held.stations));
    await repos();

    // L'app relancée : la même valeur, lue du même stockage.
    const relaunched = await launch(held);
    const after = readOne(stationOf(relaunched, "pc/claude"));
    assert.equal(after[0]?.valeur, "4 cooks at once");
    assert.equal(after[1]?.valeur, "code, navigateur-headless, macos");
    assert.equal(readOne(stationOf(relaunched, "mac/claude"))[0]?.valeur, "2 cooks at once");
  });

  test("un changement en route se dit sous sa rangée, et ses contrôles attendent sa réponse", async () => {
    const held = storage();
    let release = () => {};
    const vue = await launch(held, new Promise<void>((resolved) => (release = resolved)));
    const cooks = fieldOf(stationOf(vue, "pc/claude"));
    cooks.value = "3";
    cooks.declencher("change");
    await repos();
    const pc = stationOf(vue, "pc/claude");
    assert.deepEqual(saysUnder(lineOf(pc, "cooks")), [["dit en-cours", APPLIES]]);
    assert.equal(fieldOf(pc).disabled, true);
    assert.ok(lineOf(pc, "capacites").dessous("input").every(({ disabled }) => disabled));
    release();
    await repos();
    assert.deepEqual(saysUnder(lineOf(stationOf(vue, "pc/claude"), "cooks")), [["dit fait", "pc/claude saved"]]);
    assert.equal(fieldOf(stationOf(vue, "pc/claude")).disabled, false);
  });

  test("un changement refusé : le refus sous sa rangée, et le champ revient à la valeur en vigueur", async () => {
    const held = storage();
    const vue = await launch(held);
    const cooks = fieldOf(stationOf(vue, "pc/claude"));
    cooks.value = "120";
    cooks.declencher("input");
    cooks.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { cooks: 120, fournit: ["code", "navigateur-headless"] }]);
    const pc = stationOf(vue, "pc/claude");
    const refusal = lineOf(pc, "cooks").children.find(({ className }) => className === "dit refus") ?? assert.fail("pas de refus sous la rangée");
    assert.equal(refusal.dataset.ligne, "erreur");
    assert.match(refusal.textContent, /whole number, from 1 to 99/);
    assert.equal(fieldOf(pc).value, "1");
    assert.equal(fieldOf(pc).disabled, false);
    // Rien n'a changé au stockage.
    assert.equal(held.stations.declarees.find(({ nom: name }) => name === "pc/claude")?.cooks, 1);
  });

  test("les tickets ordinaires de la station de ce poste se cochent ici, et le restent à la relance", async () => {
    const held = storage();
    const vue = await launch(held);
    // Non prise, la valeur est en retrait (la rangée le porte, setting.css) ; prise, elle ne l'est plus.
    assert.equal(lineOf(stationOf(vue, "mac/claude"), "ordinaires").dataset.retrait, "");
    switchOf(lineOf(stationOf(vue, "mac/claude"), "ordinaires")).click();
    await repos();
    // La limite de cooks de ce poste reste celle qu'elle était.
    assert.deepEqual(vue.dernier("reglerOrdinaires"), [PARADE, true, 2]);
    assert.equal(readOne(stationOf(vue, "mac/claude"))[2]?.valeur, "taken");
    assert.equal(lineOf(stationOf(vue, "mac/claude"), "ordinaires").dataset.retrait, undefined);

    const relaunched = await launch(held);
    assert.equal(readOne(stationOf(relaunched, "mac/claude"))[2]?.valeur, "taken");
    assert.equal(lit(lineOf(stationOf(relaunched, "mac/claude"), "ordinaires")), true);
  });

  // Le bac à sable de la station locale (#2489), sur le même onglet, écrit la même option : les deux blocs disent la même.
  test("les tickets ordinaires cochés ici se lisent dans la station locale, et décochés là, ici", async () => {
    const held = storage();
    const vue = await launch(held);
    // La station de ce poste : ses lignes à elle, dans « Details » de sa carte, avant les réglages de sa déclaration.
    const locale = () => cardOf(vue, "mac/claude").dessous("div").find(({ className }) => className === "details-de-station") ?? assert.fail("pas de « Details » de ce poste");
    const sandbox = () => locale().children.find(({ className, dataset }) => className === "reglage" && dataset.cle === "ordinaires") ?? assert.fail("pas de bac à sable");
    await repos();
    assert.equal(sandbox().children[1]?.children[0]?.textContent, "not taken");
    switchOf(lineOf(stationOf(vue, "mac/claude"), "ordinaires")).click();
    await repos();
    assert.equal(sandbox().children[1]?.children[0]?.textContent, "taken");
    switchOf(sandbox()).click();
    await repos();
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), [PARADE, false, 2]);
    assert.equal(readOne(stationOf(vue, "mac/claude"))[2]?.valeur, "not taken");
    assert.equal(lit(lineOf(stationOf(vue, "mac/claude"), "ordinaires")), false);
  });

  // Retirer une station est un geste de sa carte (#2914, #3195) : « Stop cooking here », puis la confirmation en ligne ; nulle
  // part ailleurs.
  test("« Stop cooking here » sur la carte de la station demande confirmation, la retire, et elle n'y revient pas à la relance", async () => {
    const held = storage();
    const vue = await launch(held);
    const button = (pose: Fake, text: string) => pose.dessous("button").find(({ textContent }) => textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
    button(cardOf(vue, "pc/claude"), STOP).click();
    await repos();
    // Rien ne part avant le « yes » : la confirmation dit ce qu'il en coûte.
    assert.equal(vue.appels.some(({ geste: action }) => action === "changerUneStation"), false);
    const confirmation = cardOf(vue, "pc/claude").children.find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.match(confirmation.dessous("p")[0]?.textContent ?? "", /^Stop cooking parade on pc\/claude\?/);
    button(confirmation, YES_STOP).click();
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { retiree: true }]);
    vue.dire("surGuide", guide(held.stations));
    await repos();
    // Plus déclarée : ses réglages de rangée ne sont plus là (les faits du journal peuvent la dire encore).
    assert.deepEqual(set(vue).map(({ dataset }) => dataset.station), ["mac/claude"]);

    const relaunched = await launch(held);
    assert.deepEqual(set(relaunched).map(({ dataset }) => dataset.station), ["mac/claude"]);
    // La seule station qui reste ne se retire pas : rien ne part, la ligne dit pourquoi.
    button(cardOf(relaunched, "mac/claude"), STOP).click();
    await repos();
    button(cardOf(relaunched, "mac/claude").children.find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation"), YES_STOP).click();
    await repos();
    assert.equal(relaunched.appels.some(({ geste: action }) => action === "changerUneStation"), false);
    assert.match(block(relaunched).textContent, /nothing was changed: the project's only station/);
  });

  test("les réglages d'une station déclarée : ses trois rangées, et rien d'autre", () => {
    const doc = { createElement: (balise: string) => new Fake(balise) };
    const readEntries = storage().stations;
    const station = readEntries.declarees[1] ?? assert.fail();
    const actions = { appliquer() {}, ordinaires() {} };
    const pose = settingsOfTheStation(doc as never, station, inputOf(new Map(), station, readEntries), { ici: false, gestes: actions }) as unknown as Fake;
    assert.equal(pose.dataset.station, "pc/claude");
    assert.deepEqual(pose.children.map(({ dataset }) => dataset.cle), ["cooks", "capacites", "ordinaires"]);
  });
});
