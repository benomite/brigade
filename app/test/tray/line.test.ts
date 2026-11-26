// #4079 — La ligne de l'icône unique : les comptes, et l'état de la station quand elle ne cuit pas normalement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdBarDeMenus, type ProjectLu } from "../../src/bar-de-menus.ts";
import { lineDuBackground } from "../../src/tray/line.ts";

const project = (facts: ProjectLu["faits"]): ProjectLu => ({ nom: "brigade", faits: facts });

test("aucun projet : la station le dit", () => {
  assert.equal(lineDuBackground([], "illisible"), "no project on this station");
  assert.equal(lineDuBackground([], { pause: false, arret: false }), "no project on this station");
});

test("des projets : les comptes, puis la pause et l'arrêt de la station", () => {
  const A = "2026-11-15T10:00:00.000Z";
  const lu = project({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [], urgence: null });
  assert.equal(lineDuBackground([lu], { pause: false, arret: false }), "0 cooking · 0 for you");
  assert.equal(lineDuBackground([lu], { pause: true, arret: false }), "0 cooking · 0 for you · paused");
  assert.equal(lineDuBackground([lu], { pause: false, arret: true }), "0 cooking · 0 for you · stopped");
  assert.equal(lineDuBackground([lu], { pause: true, arret: true }), "0 cooking · 0 for you · paused · stopped");
  assert.equal(lineDuBackground([lu], "illisible"), "0 cooking · 0 for you");
  assert.equal(lineDuBackground([project(undefined)], "illisible"), "not read yet");
});

test("la barre des menus dit la ligne que l'app lui donne, avec les projets lus", () => {
  const dites: string[] = [];
  const bar = holdBarDeMenus({
    creer: () => ({ poser: (line) => void dites.push(line), menu: () => {}, retirer: () => {} }),
    ligne: (projects) => `${projects.length} projet · station`,
  });
  bar.poser(true, [project(undefined)]);
  assert.deepEqual(dites, ["1 projet · station"]);
});
