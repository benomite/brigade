// L'épreuve de l'épique 2484 (#2495) : chaque réglage que l'épique nomme se trouve en deux clics au plus depuis la page du
// projet, et aucun onglet ne mêle des réglages de niveaux différents — Settings : le projet seul. La vue est jouée telle
// qu'elle est, devant un faux document (helpers/false-vue.ts), et le test marche le menu comme le chef.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";

import { HEADINGS } from "../../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { StationVue } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { LEVELS } from "../../../src/vue/levels.js";
import { Fake, type Played, playTheVue, openTab, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJECTS = [{ nom: PARADE, dossier: "/tmp/parade" }];
// La station de cet ordinateur sert parade : sa carte, sur Stations, porte ses réglages (#3195).
const A = "2026-11-11T10:00:00.000Z";
const MACBOOK: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: [PARADE], max: "connectee" };
const startup = () => ({
  stations: { a: A, stations: [MACBOOK] },
  projetsDesStations: { a: A, projets: [], locale: "gmac", recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommended([]) },
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });


async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return vue;
}

// Les onglets du menu, et le chemin de clics qui y mène depuis la page du projet : Rail est ouvert d'office.
type Tab = "Rail" | "Stations" | "Settings";
const PATHS: Readonly<Record<Tab, readonly Tab[]>> = {
  Rail: [],
  Stations: ["Stations"],
  Settings: ["Settings"],
};
// Marche le menu comme le chef — un clic par entrée — et dit combien de clics il a fallu.
async function work(vue: Played, tab: Tab): Promise<number> {
  for (const step of PATHS[tab]) {
    if (step === "Settings") {
      (vue.element("onglets-du-projet").children.find((entry) => entry.textContent === "Settings") ?? assert.fail("pas d'entrée Settings")).click();
      await repos();
    } else await openTab(vue, step);
  }
  return PATHS[tab].length;
}
// Settings est une seule page, en groupes : la fausse vue ne rejoue pas la place des éléments de index.html, le test la lit donc
// dans le fichier — chaque groupe (`<section class="groupe">`) avec son niveau (le titre `niveau-…`) et les `id` qu'il porte.
const GROUPS = (() => {
  const html = readFileSync(join(import.meta.dirname, "../../../src/vue/index.html"), "utf8");
  const settings = html.slice(html.indexOf('<section id="etat"'), html.indexOf('<p id="lu-onglet"'));
  return settings
    .split('<section id="')
    .slice(2)
    .map((piece) => ({ niveau: /id="niveau-(\w+)"/.exec(piece)?.[1] ?? "", ids: [...piece.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id ?? "") }));
})();
// Ce que la page Settings montre, avec le niveau du groupe qui le porte.
const ofSettings = (vue: Played): { niveau: string; pose: Fake }[] =>
  vue.element("etat").hidden ? [] : GROUPS.flatMap(({ niveau: level, ids }) => ids.map((id) => ({ niveau: level, pose: vue.element(id) }))).filter(({ pose }) => shows(pose));
// Les éléments où chercher un réglage dans un onglet (le bandeau de santé est une section de Settings, #3014).
const roots = (vue: Played, tab: Tab): Fake[] => (tab === "Settings" ? ofSettings(vue).map(({ pose }) => pose) : [vue.element("rail")]);

// Un élément se montre quand lui et tous ses parents le font.
function shows(pose: Fake): boolean {
  for (let p: Fake | null = pose; p !== null; p = p.parentElement) if (p.hidden) return false;
  return true;
}
const shown = (inside: Fake): Fake[] => [inside, ...inside.descendants()].filter(shows);

// Où un réglage nommé par l'épique se trouve : il porte soit son bloc (`data-bloc`), soit sa clé (`data-cle`, une ligne).
type Setting = { nom: string; bloc?: string; cle?: string };
// Ceux d'une station sont dans « Details » de sa carte, sur Stations (#3195) : le clic qui ouvre le pli est le second.
const SETTINGS: readonly Setting[] = [
  { nom: "local station settings", cle: "dossier" },
  { nom: "project colors", cle: "couleurs" },
  { nom: "project label", cle: "sigle" },
];
const isThe = (pose: Fake, { bloc: block, cle: key }: Setting) => (block !== undefined && pose.dataset.bloc === block) || (key !== undefined && pose.dataset.cle === key);

// Les niveaux dits sur ce qui se montre dans un onglet : les étiquettes des lignes (`.niveau`) et celles des groupes.
const levelsSaid = (inside: Fake): string[] => shown(inside).flatMap((pose) => (pose.dataset.niveau !== undefined ? [pose.dataset.niveau] : []));
// Les réglages (lignes à clé) montrés dans un onglet, avec le niveau que la table donne à leur clé.
const levelsOfKeys = (inside: Fake): string[] => shown(inside).flatMap((pose) => (pose.dataset.cle !== undefined && LEVELS[pose.dataset.cle] !== undefined ? [LEVELS[pose.dataset.cle] as string] : []));
// Ce qui n'est pas du projet dans ce que montre une page : le niveau de son groupe, ou celui que disent ses étiquettes et ses clés.
const outsideOfProject = (poses: { niveau: string; pose: Fake }[]): string[] => [
  ...new Set(poses.flatMap(({ niveau: level, pose }) => [level === "you" || level === "machine" ? level : "project", ...levelsSaid(pose), ...levelsOfKeys(pose)])),
].filter((level) => level !== "project");

describe("l'épreuve de l'épique 2484 (#2495)", () => {
  test("chaque réglage de l'épique s'atteint en deux clics au plus depuis la page du projet", async () => {
    const vue = await open();
    const found = new Map<string, { onglet: Tab; clics: number }>();
    for (const tab of Object.keys(PATHS) as Tab[]) {
      const clics = await work(vue, tab);
      for (const setting of SETTINGS) {
        if (!found.has(setting.nom) && roots(vue, tab).some((root) => shown(root).some((pose) => isThe(pose, setting)))) found.set(setting.nom, { onglet: tab, clics });
      }
    }
    for (const { nom: name } of SETTINGS) {
      const finds = found.get(name) ?? assert.fail(`« ${name} » n'est sur aucun onglet du menu`);
      assert.ok(finds.clics <= 2, `« ${name} » demande ${finds.clics} clics (${finds.onglet})`);
    }
  });

  // `todo` tant que les groupes « this computer » et « you » (sigle, couleurs, retrait) sont encore dans Settings : les tickets
  // de l'épique qui les déménagent (#2489, #2491, #2492, #2494) ne sont pas sur main. Le test garde son corps ; on ôte `todo`
  // quand le dernier est livré.
  test("Settings ne montre que le projet : ni réglage de la machine, ni préférence de toi", { todo: "Settings still holds the machine and you groups until #2489, #2491, #2492 and #2494 land" }, async () => {
    const vue = await open();
    await work(vue, "Settings");
    assert.deepEqual(outsideOfProject(ofSettings(vue)), []);
  });

  test("Stations montre ses réglages avec leur niveau", async () => {
    const vue = await open();
    await work(vue, "Stations");
    for (const level of levelsSaid(vue.element("rail"))) assert.ok(["project", "machine", "you"].includes(level), `niveau inconnu « ${level} »`);
  });

  test("le garde-fou voit un réglage de la machine ou de toi posé dans Settings", () => {
    for (const [key, level] of [["cooks", "machine"], ["couleurs", "you"]] as const) {
      const line = new Fake("div");
      line.dataset.cle = key;
      assert.deepEqual(outsideOfProject([{ niveau: "project", pose: line }]), [level]);
      const label = new Fake("span");
      label.dataset.niveau = level;
      assert.deepEqual(outsideOfProject([{ niveau: "project", pose: label }]), [level]);
      assert.deepEqual(outsideOfProject([{ niveau: level, pose: new Fake("div") }]), [level]);
    }
    // Ce qui est caché ne compte pas : une ligne sous un parent caché ne se montre pas.
    const hidden = new Fake("section");
    hidden.hidden = true;
    const line = new Fake("div");
    hidden.append(line);
    assert.equal(shows(line), false);
  });
});
