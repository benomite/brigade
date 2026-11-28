// L'épreuve de l'épique 2484 (#2495) : chaque réglage que l'épique nomme se trouve en deux clics au plus depuis la page du
// projet, et aucun onglet ne mêle des réglages de niveaux différents — Settings : le projet seul. La vue est jouée telle
// qu'elle est, devant un faux document (helpers/false-vue.ts), et le test marche le menu comme le chef.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import type { StationVue } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { LEVELS } from "../../../src/vue/levels.js";
import { Fake, type Played, openTab, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJECTS = [{ nom: PARADE, dossier: "/tmp/parade" }];
// La station de cet ordinateur sert parade : sa carte, sur Stations, porte ses réglages (#3195).
const A = "2026-11-11T10:00:00.000Z";
const MACBOOK: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: [PARADE], max: "connectee" };



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
