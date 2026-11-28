// #4079 — La ligne de l'icône unique : les comptes, et l'état de la station quand elle ne cuit pas normalement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdMenuBar, type ProjectRead } from "../../src/menu-bar.ts";
import { lineOfBackground } from "../../src/tray/line.ts";

const project = (facts: ProjectRead["faits"]): ProjectRead => ({ nom: "brigade", faits: facts });

test("aucun projet : la station le dit", () => {
  assert.equal(lineOfBackground([], "illisible"), "no project on this station");
  assert.equal(lineOfBackground([], { pause: false }), "no project on this station");
});


test("la barre des menus dit la ligne que l'app lui donne, avec les projets lus", () => {
  const saidEntries: string[] = [];
  const bar = holdMenuBar({
    creer: () => ({ poser: (line) => void saidEntries.push(line), menu: () => {}, retirer: () => {} }),
    ligne: (projects) => `${projects.length} projet · station`,
  });
  bar.poser(true, [project(undefined)]);
  assert.deepEqual(saidEntries, ["1 projet · station"]);
});
