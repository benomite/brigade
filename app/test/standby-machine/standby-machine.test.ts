// Ce Mac gardé éveillé tant qu'un cook cuit (#3642) : ce que le chef en voit. La carte de la station de cet ordinateur,
// dans l'onglet Stations, dit qu'elle le garde éveillé exactement quand elle tient l'assertion ; le menu de l'icône de la
// station le dit aussi, et porte la case du réglage ; hors d'un Mac, ni ligne ni case. Derrière le pont, l'état est celui
// que le runtime écrit et lit, dans un répertoire du test.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { ecrireEtat, ecrireReglage, lireVeille, REGLAGE, type Veille } from "../../../runtime/src/veille-machine/contrat.ts";
import type { Home } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { putAPart } from "../../src/awaiting.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { menuOfBackground } from "../../src/tray-background/tray-background.ts";
import { followTheStandby } from "../../src/vue/standby-machine/follow.ts";
import { GUARD_AWAKE, KEEP_AWAKE } from "../../src/vue/standby-machine/standby-machine.js";
import { type Played, playTheVue, openTab, repos } from "../helpers/false-vue.ts";

const A = "2026-11-15T10:00:00.000Z";
const REPOSITORY = "benomite/parade";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Outage[], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: REPOSITORY, base: "main" };
const HERE: ProjectSeen = { nom: "parade", depot: REPOSITORY, base: "main", suiviPar: { id: "gmac", nom: "macbook" }, stations: [{ id: "gmac", nom: "macbook", etat: "servi", dit: "", autoriser: [] }], servi: null, cuitSur: { id: "gmac", nom: "macbook", ici: true }, demenagement: null } as never;
const SEEN: SeenOfProjects = { a: A, projets: [HERE], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };
const COOK = { ticket: 14, titre: "Le journal en ajout seul", station: "macbook/claude" };
const FACTS = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [COOK],
  attend: [],
  livres: [],
  stations: [{ station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, presente: true, cooks: [COOK] }],
} as unknown as Facts;

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const rootOfTest = () => {
  const root = mkdtempSync(join(tmpdir(), "veille-machine-"));
  roots.push(root);
  return root;
};
// Tous les process vivent : ceux du test sont des pids inventés.
const allAlive = () => true;

// L'onglet Stations de parade, que ce Mac cuit ; `veille` : ce que le pont rend de la veille de sa station.
async function thePage(standby: () => Veille | undefined) {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true, (name) => name === "parade"),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [MAC] } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: SEEN,
    }),
    espace: () => [],
    projetsServis: () => ({ depots: [REPOSITORY] }),
    veilleMachine: standby,
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  const drawable = heldOnes.attendre(putAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? receivedOne;
  vue.dire("surFaits", { ...drawable, demande: vue.dernier("faits")[0] as number });
  await repos();
  await openTab(vue, "Stations");
  return vue;
}

const cardOfHere = (vue: Played) =>
  vue
    .element("rail")
    .dessous("section")
    .find(({ className, dataset }) => className === "carte-de-station" && dataset.station === "gmac") ?? assert.fail("pas de carte pour ce Mac");
const lineOfStandby = (vue: Played) => cardOfHere(vue).dessous("p").filter(({ className }) => className === "veille-machine");

describe("la carte de la station de ce Mac (#3642)", () => {
  test("elle dit qu'elle garde ce Mac éveillé tant que l'assertion est tenue, et rien quand elle ne l'est plus", async () => {
    const root = rootOfTest();
    ecrireEtat(root, { tenue: true, caffeinate: 4242, station: 4241 });
    const vue = await thePage(() => lireVeille(root, "darwin", allAlive));
    assert.deepEqual(
      lineOfStandby(vue).map(({ textContent }) => textContent),
      [GUARD_AWAKE],
    );
    // Le dernier cook a fini : la station a relâché l'assertion, le process principal le redit.
    ecrireEtat(root, { tenue: false });
    vue.dire("surVeilleMachine", lireVeille(root, "darwin", allAlive));
    await repos();
    assert.equal(lineOfStandby(vue).length, 0);
  });

  test("une station tuée laisse un état « tenue » qui ne se montre pas : son caffeinate est mort avec elle", async () => {
    const root = rootOfTest();
    ecrireEtat(root, { tenue: true, caffeinate: 4242, station: 4241 });
    const vue = await thePage(() => lireVeille(root, "darwin", (pid) => pid !== 4242));
    assert.equal(lineOfStandby(vue).length, 0);
  });

  test("hors d'un Mac, ou sans rien de lu, la carte n'en dit rien", async () => {
    const root = rootOfTest();
    ecrireEtat(root, { tenue: true, caffeinate: 4242, station: 4241 });
    assert.equal(lineOfStandby(await thePage(() => lireVeille(root, "win32", allAlive))).length, 0);
    assert.equal(lineOfStandby(await thePage(() => undefined)).length, 0);
  });
});

describe("le menu de l'icône de la station (#3642)", () => {
  const station = { pause: false, arret: false };
  const wordings = (standby: Veille | undefined) => menuOfBackground([], station, standby).filter((entry) => entry.genre !== "separateur").map((entry) => ("libelle" in entry ? entry.libelle : ""));
  const theCase = (standby: Veille | undefined) => menuOfBackground([], station, standby).find((entry) => entry.genre === "case");

  test("la ligne sous l'état de la cuisine tant que l'assertion est tenue, et la case cochée", () => {
    const root = rootOfTest();
    ecrireEtat(root, { tenue: true, caffeinate: 4242, station: 4241 });
    const standby = lireVeille(root, "darwin", allAlive);
    assert.equal(wordings(standby)[1], GUARD_AWAKE);
    assert.deepEqual(theCase(standby), { genre: "case", geste: "veille", libelle: KEEP_AWAKE, coche: true, actif: true });
  });

  test("le réglage éteint : ni ligne, la case décochée ; illisible, la case grisée le dit", () => {
    const root = rootOfTest();
    assert.deepEqual(ecrireReglage(root, false), { fait: true });
    ecrireEtat(root, { tenue: false });
    const off = lireVeille(root, "darwin", allAlive);
    assert.ok(!wordings(off).includes(GUARD_AWAKE));
    assert.deepEqual(theCase(off), { genre: "case", geste: "veille", libelle: KEEP_AWAKE, coche: false, actif: true });
    writeFileSync(join(root, REGLAGE), "pas du json");
    const unreadable = theCase(lireVeille(root, "darwin", allAlive));
    assert.equal(unreadable?.genre === "case" && unreadable.actif, false);
    assert.match(unreadable?.libelle ?? "", /setting unreadable/);
  });

  test("hors d'un Mac : ni ligne ni case, le menu est celui d'avant", () => {
    const root = rootOfTest();
    ecrireEtat(root, { tenue: true, caffeinate: 4242, station: 4241 });
    const elsewhere = lireVeille(root, "win32", allAlive);
    assert.deepEqual(menuOfBackground([], station, elsewhere), menuOfBackground([], station));
    assert.equal(theCase(elsewhere), undefined);
  });
});

describe("le process principal suit la veille (#3642)", () => {
  test("il dit à la vue chaque changement, une fois, et une lecture qui échoue la laisse inconnue", async () => {
    let readOne: Veille | Error = { sorte: "mac", reglage: { garderEveille: true }, tenue: true };
    const saidEntries: (Veille | undefined)[] = [];
    const warned: string[] = [];
    const tracking = followTheStandby({ lire: async () => (readOne instanceof Error ? Promise.reject(readOne) : readOne), dire: (standby) => saidEntries.push(standby), avertir: (line) => warned.push(line), intervalleMs: 3_600_000 });
    try {
      await tracking.relire();
      assert.equal(saidEntries.length, 1, "la même lecture ne se redit pas");
      readOne = { sorte: "mac", reglage: { garderEveille: true }, tenue: false };
      assert.deepEqual(await tracking.relire(), readOne);
      readOne = new Error("module introuvable");
      assert.equal(await tracking.relire(), undefined);
      await tracking.relire();
      assert.deepEqual(saidEntries, [{ sorte: "mac", reglage: { garderEveille: true }, tenue: true }, { sorte: "mac", reglage: { garderEveille: true }, tenue: false }, undefined]);
      assert.equal(warned.length, 1);
    } finally {
      tracking.arreter();
    }
  });
});
