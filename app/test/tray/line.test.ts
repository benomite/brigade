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

test("des projets : les comptes, puis la pause de la station", () => {
  const A = "2026-11-15T10:00:00.000Z";
  const readOne = project({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [] });
  assert.equal(lineOfBackground([readOne], { pause: false }), "0 cooking · 0 for you");
  assert.equal(lineOfBackground([readOne], { pause: true }), "0 cooking · 0 for you · paused");
  assert.equal(lineOfBackground([readOne], "illisible"), "0 cooking · 0 for you");
  assert.equal(lineOfBackground([project(undefined)], "illisible"), "not read yet");
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
