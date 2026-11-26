// Les réglages de chaque station, sur l'onglet Stations (#2488, épique #2484) : pour chacune, son plafond de cooks, ses
// capacités, et si elle prend les tickets ordinaires, chacun avec son niveau. Un changement fait
// ici s'applique dès que son contrôle change — aucun « Save » (#2920) — et part par le stockage qui existe déjà — la déclaration des stations (`changerUneStation`), l'option des tickets
// ordinaires de ce poste (`reglerOrdinaires`) — et se relit tel quel quand l'app est relancée : le faux pont de ce test
// tient ce stockage, comme le process principal. La vue jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { blocDesOrdinaires, type FactsStation } from "../../../src/ordinaires.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import type { Guide, StationChangee, StationsLues, StationVoulue } from "../../../src/service.ts";
import { NIVEAUX_DITS } from "../../../src/vue/niveaux.js";
import { ORDINAIRES_D_AILLEURS, settingsDeLaStation, SETTINGS, saisieDe } from "../../../src/vue/project/stations/StationSettings.js";
import { ARRETER, OUI_STOP } from "../../../src/vue/stations-tab/stations-tab.js";
import { APPLIQUE } from "../../../src/vue/stations-declarees.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-05T10:04:12.000Z";
const PARADE = "parade";

// Ce que le process principal garde, d'un lancement de l'app à l'autre : la déclaration des stations du projet, que sa
// station principale tient, et l'option des tickets ordinaires de ce poste, dans le fichier des projets.
type Stockage = { stations: StationsLues; projet: Project };
const stockage = (): Stockage => ({
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
const station = (name: string, remote: boolean, ordinaires: boolean): FactsStation => ({ station: name, distante: remote, plafond: null, ordinaires, bacASable: null, prendOrdinaires: ordinaires, cuisson: "cooking", cooks: [] });
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

const guide = (stations: StationsLues): Guide => ({
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

const demarrage = (project: Project) => () => ({
  // « parade » cuit sur ce poste : sa station de la box est celle de ce Mac.
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [project] }, () => true, (name) => name === PARADE),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Le faux process principal : il lit et écrit `tenu`, comme main.ts et service.ts lisent et écrivent leur stockage.
function changer(tenu: Stockage, name: string, voulu: StationVoulue): StationChangee {
  const declarees = tenu.stations.declarees;
  // Comme service.ts : un plafond hors de 1 à 99 est refusé, rien n'est écrit.
  if (!("retiree" in voulu) && (voulu.cooks < 1 || voulu.cooks > 99)) return { refus: `Nothing was saved: how many cooks ${name} runs at once is a whole number, from 1 to 99.` };
  if ("retiree" in voulu) tenu.stations = { ...tenu.stations, declarees: declarees.filter((lue) => lue.nom !== name) };
  else tenu.stations = { ...tenu.stations, declarees: declarees.map((lue) => (lue.nom === name ? { ...lue, cooks: voulu.cooks, fournit: [...voulu.fournit] } : lue)) };
  return { fait: "retiree" in voulu ? `${name} no longer serves ${PARADE}` : `${name} saved` };
}

// Un lancement de l'app : « parade » ouverte, ses faits lus, l'onglet Stations montré. `retenir` : le faux process
// principal garde sa réponse à `changerUneStation` jusqu'à ce que le test la lâche.
async function lancer(tenu: Stockage, retenir?: Promise<void>): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: demarrage(tenu.projet),
    espace: () => [],
    service: () => guide(tenu.stations),
    ordinaires: () => blocDesOrdinaires(tenu.projet, "darwin", FACTS.stations, true),
    reglerOrdinaires: (_, actif, limit) => {
      tenu.projet = { ...tenu.projet, ordinaires: actif, ...(limit === null ? {} : { limiteCooks: limit }) };
      return undefined;
    },
    changerUneStation: async (_, name, voulu) => {
      if (retenir !== undefined) await retenir;
      return changer(tenu, name, voulu);
    },
    lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Stations");
  return vue;
}

// L'onglet Stations (#3195) : les réglages d'une station déclarée sont dans « Details » de sa carte.
const bloc = (vue: Jouee) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const reglees = (vue: Jouee) => bloc(vue).dessous("section").filter(({ className }) => className === "station-reglee");
const stationDe = (vue: Jouee, name: string) => reglees(vue).find(({ dataset }) => dataset.station === name) ?? assert.fail(`pas de réglages pour ${name}`);
const cardDe = (vue: Jouee, name: string) => bloc(vue).dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === name) ?? assert.fail(`pas de carte pour ${name}`);
const lineDe = (pose: Faux, cle: string) => pose.children.find(({ className, dataset }) => className === "reglage" && dataset.cle === cle) ?? assert.fail(`pas de ligne « ${cle} »`);
const switchDe = (line: Faux) => line.dessous("button").find(({ role }) => role === "switch") ?? assert.fail("pas d'interrupteur");
const allume = (line: Faux) => switchDe(line).ariaChecked === "true";
const buttonDe = (pose: Faux, texte: string) => pose.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const champDe = (pose: Faux) => lineDe(pose, "cooks").dessous("input")[0] ?? assert.fail("pas de champ");
// Ce qu'une rangée dit sous elle : ce que son dernier changement a rendu.
const ditSous = (line: Faux) => line.children.filter(({ className }) => className.startsWith("dit")).map(({ className, textContent }) => [className, textContent]);

// Une station telle que l'écran la dit : chaque réglage, son niveau, sa valeur, et s'il se change d'ici.
const lu = (pose: Faux) =>
  pose.children
    .filter(({ className }) => className === "reglage")
    .map((line) => {
      const [name, valeur, champ] = line.children;
      const niveau = name?.children.find(({ className }) => className === "niveau");
      const entrees = [...(champ?.dessous("input") ?? []), ...(champ?.dessous("button") ?? []).filter(({ role }) => role === "switch")];
      return {
        cle: line.dataset.cle,
        nom: name?.textContent.replace(niveau?.textContent ?? "", ""),
        niveau: niveau?.textContent,
        valeur: valeur?.children[0]?.textContent,
        reglable: entrees.some(({ disabled }) => !disabled),
      };
    });

describe("l'onglet Stations : les réglages de chaque station (#2488), dans « Details » de sa carte (#3195)", () => {
  test("pour chaque station, les trois réglages, chacun avec son niveau, et ce qui se change d'ici", async () => {
    const vue = await lancer(stockage());
    const machine = NIVEAUX_DITS.machine.libelle;
    assert.deepEqual(
      reglees(vue).map(({ dataset }) => dataset.station),
      ["mac/claude", "pc/claude"],
    );
    // Chacune dans « Details » de sa carte, replié tant que le chef ne l'ouvre pas.
    for (const name of ["mac/claude", "pc/claude"]) assert.equal((cardDe(vue, name).dessous("details")[0] as unknown as { open?: boolean } | undefined)?.open, false);
    assert.equal(bloc(vue).textContent.includes("not read yet"), false);
    assert.deepEqual(lu(stationDe(vue, "mac/claude")), [
      { cle: "cooks", nom: "cooks at once", niveau: machine, valeur: "2 cooks at once", reglable: true },
      { cle: "capacites", nom: "what it provides", niveau: machine, valeur: "code, macos", reglable: true },
      { cle: "ordinaires", nom: "ordinary tickets", niveau: machine, valeur: "not taken", reglable: true },
    ]);
    // pc/claude joue ailleurs : ses tickets ordinaires sont ce que `facts` dit d'elle, et le survol dit pourquoi ils ne se
    // changent pas d'ici.
    const pc = stationDe(vue, "pc/claude");
    assert.deepEqual(lu(pc), [
      { cle: "cooks", nom: "cooks at once", niveau: machine, valeur: "1 cook at once", reglable: true },
      { cle: "capacites", nom: "what it provides", niveau: machine, valeur: "code, navigateur-headless", reglable: true },
      { cle: "ordinaires", nom: "ordinary tickets", niveau: machine, valeur: "taken", reglable: false },
    ]);
    assert.equal(allume(lineDe(pc, "ordinaires")), true);
    assert.equal(switchDe(lineDe(pc, "ordinaires")).disabled, true);
    assert.ok(lineDe(pc, "ordinaires").dessous("button").some(({ ariaLabel }) => ariaLabel === ORDINAIRES_D_AILLEURS));
    // Les cases des capacités : celles de chaque station du projet, cochées comme elle les déclare.
    const cochees = (pose: Faux) => lineDe(pose, "capacites").dessous("input").filter(({ type, checked }) => type === "checkbox" && checked).map(({ ariaLabel }) => ariaLabel);
    assert.deepEqual(cochees(pc), ["code", "navigateur-headless"]);
    assert.deepEqual(SETTINGS.map(({ cle }) => cle), ["cooks", "capacites", "ordinaires"]);
    // Servir le projet n'est pas une rangée de ses réglages : l'arrêter est sur sa carte (« Stop cooking here »), et nulle part ailleurs.
    assert.deepEqual(reglees(vue).flatMap((pose) => pose.dessous("button")).filter(({ textContent }) => /remove|stop/i.test(textContent)), []);
    assert.deepEqual(reglees(vue).flatMap((pose) => pose.dessous("input")).filter(({ ariaLabel }) => /serves/.test(ariaLabel ?? "")), []);
  });

  test("aucun « Save » : le bloc n'a que ses contrôles, et rien ne part tant qu'aucun ne change", async () => {
    const vue = await lancer(stockage());
    assert.deepEqual(bloc(vue).dessous("button").filter(({ textContent }) => /^(save|saving…)$/i.test(textContent)), []);
    // Le champ tapé sans être quitté n'envoie rien ; quitté à la même valeur non plus.
    const cooks = champDe(stationDe(vue, "pc/claude"));
    cooks.value = "3";
    cooks.declencher("input");
    cooks.value = "1";
    cooks.declencher("change");
    await repos();
    assert.equal(vue.appels.some(({ geste: action }) => action === "changerUneStation"), false);
  });

  test("le plafond et les capacités changés ici s'appliquent aussitôt, et se relisent tels quels à la relance de l'app", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    // Le plafond, dès que son champ change : la déclaration entière de la station part, ce plafond dedans.
    const cooks = champDe(stationDe(vue, "pc/claude"));
    cooks.value = "4";
    cooks.declencher("input");
    cooks.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { cooks: 4, fournit: ["code", "navigateur-headless"] }]);
    assert.deepEqual(ditSous(lineDe(stationDe(vue, "pc/claude"), "cooks")), [["dit fait", "pc/claude saved"]]);
    // La déclaration relue arrive par le contrôle suivant.
    vue.dire("surGuide", guide(tenu.stations));
    await repos();
    assert.equal(lu(stationDe(vue, "pc/claude"))[0]?.valeur, "4 cooks at once");
    // Une case cochée part aussitôt, elle aussi, le plafond en vigueur dedans ; ce qu'elle a rendu se lit sous sa rangée.
    const macos = lineDe(stationDe(vue, "pc/claude"), "capacites").dessous("input").find(({ ariaLabel }) => ariaLabel === "macos") ?? assert.fail("pas de case macos");
    macos.checked = true;
    macos.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { cooks: 4, fournit: ["code", "navigateur-headless", "macos"] }]);
    assert.deepEqual(ditSous(lineDe(stationDe(vue, "pc/claude"), "capacites")), [["dit fait", "pc/claude saved"]]);
    assert.deepEqual(ditSous(lineDe(stationDe(vue, "pc/claude"), "cooks")), []);
    vue.dire("surGuide", guide(tenu.stations));
    await repos();

    // L'app relancée : la même valeur, lue du même stockage.
    const relancee = await lancer(tenu);
    const apres = lu(stationDe(relancee, "pc/claude"));
    assert.equal(apres[0]?.valeur, "4 cooks at once");
    assert.equal(apres[1]?.valeur, "code, navigateur-headless, macos");
    assert.equal(lu(stationDe(relancee, "mac/claude"))[0]?.valeur, "2 cooks at once");
  });

  test("un changement en route se dit sous sa rangée, et ses contrôles attendent sa réponse", async () => {
    const tenu = stockage();
    let lacher = () => {};
    const vue = await lancer(tenu, new Promise<void>((resolu) => (lacher = resolu)));
    const cooks = champDe(stationDe(vue, "pc/claude"));
    cooks.value = "3";
    cooks.declencher("change");
    await repos();
    const pc = stationDe(vue, "pc/claude");
    assert.deepEqual(ditSous(lineDe(pc, "cooks")), [["dit en-cours", APPLIQUE]]);
    assert.equal(champDe(pc).disabled, true);
    assert.ok(lineDe(pc, "capacites").dessous("input").every(({ disabled }) => disabled));
    lacher();
    await repos();
    assert.deepEqual(ditSous(lineDe(stationDe(vue, "pc/claude"), "cooks")), [["dit fait", "pc/claude saved"]]);
    assert.equal(champDe(stationDe(vue, "pc/claude")).disabled, false);
  });

  test("un changement refusé : le refus sous sa rangée, et le champ revient à la valeur en vigueur", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    const cooks = champDe(stationDe(vue, "pc/claude"));
    cooks.value = "120";
    cooks.declencher("input");
    cooks.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { cooks: 120, fournit: ["code", "navigateur-headless"] }]);
    const pc = stationDe(vue, "pc/claude");
    const refusal = lineDe(pc, "cooks").children.find(({ className }) => className === "dit refus") ?? assert.fail("pas de refus sous la rangée");
    assert.equal(refusal.dataset.ligne, "erreur");
    assert.match(refusal.textContent, /whole number, from 1 to 99/);
    assert.equal(champDe(pc).value, "1");
    assert.equal(champDe(pc).disabled, false);
    // Rien n'a changé au stockage.
    assert.equal(tenu.stations.declarees.find(({ nom: name }) => name === "pc/claude")?.cooks, 1);
  });

  test("les tickets ordinaires de la station de ce poste se cochent ici, et le restent à la relance", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    // Non prise, la valeur est en retrait (la rangée le porte, setting.css) ; prise, elle ne l'est plus.
    assert.equal(lineDe(stationDe(vue, "mac/claude"), "ordinaires").dataset.retrait, "");
    switchDe(lineDe(stationDe(vue, "mac/claude"), "ordinaires")).click();
    await repos();
    // La limite de cooks de ce poste reste celle qu'elle était.
    assert.deepEqual(vue.dernier("reglerOrdinaires"), [PARADE, true, 2]);
    assert.equal(lu(stationDe(vue, "mac/claude"))[2]?.valeur, "taken");
    assert.equal(lineDe(stationDe(vue, "mac/claude"), "ordinaires").dataset.retrait, undefined);

    const relancee = await lancer(tenu);
    assert.equal(lu(stationDe(relancee, "mac/claude"))[2]?.valeur, "taken");
    assert.equal(allume(lineDe(stationDe(relancee, "mac/claude"), "ordinaires")), true);
  });

  // Le bac à sable de la station locale (#2489), sur le même onglet, écrit la même option : les deux blocs disent la même.
  test("les tickets ordinaires cochés ici se lisent dans la station locale, et décochés là, ici", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    // La station de ce poste : ses lignes à elle, dans « Details » de sa carte, avant les réglages de sa déclaration.
    const locale = () => cardDe(vue, "mac/claude").dessous("div").find(({ className }) => className === "details-de-station") ?? assert.fail("pas de « Details » de ce poste");
    const sandbox = () => locale().children.find(({ className, dataset }) => className === "reglage" && dataset.cle === "ordinaires") ?? assert.fail("pas de bac à sable");
    await repos();
    assert.equal(sandbox().children[1]?.children[0]?.textContent, "not taken");
    switchDe(lineDe(stationDe(vue, "mac/claude"), "ordinaires")).click();
    await repos();
    assert.equal(sandbox().children[1]?.children[0]?.textContent, "taken");
    switchDe(sandbox()).click();
    await repos();
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), [PARADE, false, 2]);
    assert.equal(lu(stationDe(vue, "mac/claude"))[2]?.valeur, "not taken");
    assert.equal(allume(lineDe(stationDe(vue, "mac/claude"), "ordinaires")), false);
  });

  // Retirer une station est un geste de sa carte (#2914, #3195) : « Stop cooking here », puis la confirmation en ligne ; nulle
  // part ailleurs.
  test("« Stop cooking here » sur la carte de la station demande confirmation, la retire, et elle n'y revient pas à la relance", async () => {
    const tenu = stockage();
    const vue = await lancer(tenu);
    const button = (pose: Faux, texte: string) => pose.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
    button(cardDe(vue, "pc/claude"), ARRETER).click();
    await repos();
    // Rien ne part avant le « yes » : la confirmation dit ce qu'il en coûte.
    assert.equal(vue.appels.some(({ geste: action }) => action === "changerUneStation"), false);
    const confirmation = cardDe(vue, "pc/claude").children.find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.match(confirmation.dessous("p")[0]?.textContent ?? "", /^Stop cooking parade on pc\/claude\?/);
    button(confirmation, OUI_STOP).click();
    await repos();
    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { retiree: true }]);
    vue.dire("surGuide", guide(tenu.stations));
    await repos();
    // Plus déclarée : ses réglages de rangée ne sont plus là (les faits du journal peuvent la dire encore).
    assert.deepEqual(reglees(vue).map(({ dataset }) => dataset.station), ["mac/claude"]);

    const relancee = await lancer(tenu);
    assert.deepEqual(reglees(relancee).map(({ dataset }) => dataset.station), ["mac/claude"]);
    // La seule station qui reste ne se retire pas : rien ne part, la ligne dit pourquoi.
    button(cardDe(relancee, "mac/claude"), ARRETER).click();
    await repos();
    button(cardDe(relancee, "mac/claude").children.find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation"), OUI_STOP).click();
    await repos();
    assert.equal(relancee.appels.some(({ geste: action }) => action === "changerUneStation"), false);
    assert.match(bloc(relancee).textContent, /nothing was changed: the project's only station/);
  });

  test("les réglages d'une station déclarée : ses trois rangées, et rien d'autre", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const lues = stockage().stations;
    const station = lues.declarees[1] ?? assert.fail();
    const actions = { appliquer() {}, ordinaires() {} };
    const pose = settingsDeLaStation(doc as never, station, saisieDe(new Map(), station, lues), { ici: false, gestes: actions }) as unknown as Faux;
    assert.equal(pose.dataset.station, "pc/claude");
    assert.deepEqual(pose.children.map(({ dataset }) => dataset.cle), ["cooks", "capacites", "ordinaires"]);
  });
});
