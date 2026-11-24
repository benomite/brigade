// #4079 — La ligne de l'icône unique : les comptes, et l'état de la station quand elle ne cuit pas normalement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tenirBarreDeMenus, type ProjetLu } from "../../src/barre-de-menus.ts";
import { ligneDuFond } from "../../src/tray/ligne.ts";

const projet = (faits: ProjetLu["faits"]): ProjetLu => ({ nom: "brigade", faits });

test("aucun projet : la station le dit", () => {
  assert.equal(ligneDuFond([], "illisible"), "no project on this station");
  assert.equal(ligneDuFond([], { pause: false, arret: false }), "no project on this station");
});

test("des projets : les comptes, puis la pause et l'arrêt de la station", () => {
  const A = "2026-11-15T10:00:00.000Z";
  const lu = projet({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [], urgence: null });
  assert.equal(ligneDuFond([lu], { pause: false, arret: false }), "0 cooking · 0 for you");
  assert.equal(ligneDuFond([lu], { pause: true, arret: false }), "0 cooking · 0 for you · paused");
  assert.equal(ligneDuFond([lu], { pause: false, arret: true }), "0 cooking · 0 for you · stopped");
  assert.equal(ligneDuFond([lu], { pause: true, arret: true }), "0 cooking · 0 for you · paused · stopped");
  assert.equal(ligneDuFond([lu], "illisible"), "0 cooking · 0 for you");
  assert.equal(ligneDuFond([projet(undefined)], "illisible"), "not read yet");
});

test("la barre des menus dit la ligne que l'app lui donne, avec les projets lus", () => {
  const dites: string[] = [];
  const barre = tenirBarreDeMenus({
    creer: () => ({ poser: (ligne) => void dites.push(ligne), menu: () => {}, retirer: () => {} }),
    ligne: (projets) => `${projets.length} projet · station`,
  });
  barre.poser(true, [projet(undefined)]);
  assert.deepEqual(dites, ["1 projet · station"]);
});
