// Le second est à droite, en permanence : ce n'est pas une page. Il est visible en même temps
// que le rail ; à côté de lui, au même niveau, les shells — un shell montré ne le remplace
// jamais, son onglet le rend en un clic. Changer de page au centre ne le ferme ni ne le vide ; et
// un clic à gauche (une carte, un bouton, un geste) écrit dans lui sans que le centre change.
// La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { type Project } from "../src/config.ts";

import type { Terminal } from "../src/terminals.ts";
import { type Fake, type Played, repos } from "./helpers/false-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const KITCHEN = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const FANFARE: Project = { nom: "fanfare", dossier: "/tmp/fanfare" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const OTHER: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const SHELL: Terminal = { id: 2, projet: "parade", genre: "shell", titre: "shell 1", note: "", arrete: false };

// La case de la barre : « T », puis les projets dans l'ordre du fichier, puis « + ».
const enter = async (vue: Played, rank: number) => {
  (vue.element("projets").children.at(rank) ?? assert.fail(`pas d'entrée ${rank}`)).click();
  await repos();
};
const click = async (vue: Played, or: Fake, text: string) => {
  (or.dessous("button").find((pose) => pose.textContent === text) ?? or.children.find((pose) => pose.textContent === text) ?? assert.fail(`pas de « ${text} »`)).click();
  await repos();
};
// En haut, les onglets de pages ; à droite, ceux des terminaux.
const titles = (vue: Played) => vue.element("onglets-du-projet").children.map((pose) => pose.textContent);
const selected = (vue: Played) => vue.element("onglets-du-projet").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent);
const terminals = (vue: Played) => vue.element("terminaux").children.map((pose) => pose.textContent);
const shows = (vue: Played) => vue.element("terminaux").children.filter((pose) => pose.ariaSelected === "true").map((pose) => pose.textContent);
// Les cadres des terminaux, là où la vue les a posés : dans la colonne de droite, et nulle part ailleurs.
const frames = (vue: Played) => vue.element("fil").children;
// Ce qui se voit à droite pour le projet affiché : la colonne, ses cadres montrés, le titre de l'onglet du second, la note.
function seenOfSecond(vue: Played) {
  const shown = frames(vue).filter((frame) => !frame.hidden);
  return { colonne: !vue.element("second").hidden, cadres: shown.length, titre: terminals(vue)[0], note: vue.element("note-second").textContent };
}

describe("le second est une colonne à droite, pas une page", () => {
  test("dans la page, il a sa colonne à lui : hors de la zone centrale, au bord droit du cadre — les onglets des terminaux en tête", () => {
    const html = readFileSync(join(VUE, "index.html"), "utf8");
    const frame = html.slice(html.indexOf('<div id="cadre">'), html.indexOf('<p id="relecture"'));
    const ranks = ["<main>", "</main>", '<aside id="second"', 'id="terminaux"', 'id="fil"'].map((marker) => frame.indexOf(marker));

    assert.ok(ranks.every((rank) => rank !== -1), "le cadre ne porte pas la colonne du second");
    assert.deepEqual(ranks, ranks.toSorted((a, b) => a - b));
    // Rien n'est posé après elle dans le cadre : c'est la dernière colonne.
    assert.match(frame.slice(frame.indexOf('<aside id="second"')), /^<aside id="second"[^]*?<\/aside>\s*<\/div>\s*$/);
  });








});

describe("à droite, les shells à côté du second : un shell ne remplace jamais le second", () => {






});

describe("l'écran principal ne garde que la bande, le rail et les terminaux ; le reste est derrière un onglet, en haut", () => {
  const RELAYS = "sauvegarde       il y a 10 h\nrail             2 tickets";




});
