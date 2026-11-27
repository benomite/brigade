// Test d'acceptation (#4347), critère 2 : le parcours d'appairage ne demande jamais de taper sur le serveur une autre
// commande que la ligne montrée, ni d'ouvrir `docs/installation-station.md`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { poserLOngletDesStations } from "../../src/vue/stations-tab/stations-tab.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const GESTES = { choisirQuiCuit() {}, deplacer() {}, versIci() {}, cuireIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
const BASE = { projet: "parade", poste: "this Mac", lues: true, haut: { vert: false, etat: "aucune", dit: "" }, servantes: [], deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set() };
const ONE_LINER = /curl -fsSL https:\/\/github\.com\/benomite\/brigade\/releases\/download\/station\/installer-station\.sh \| sh/;

test("the `add a server` screens show the one-liner and never point to installation-station.md or another command", () => {
  const racine = poserLOngletDesStations(doc as never, BASE as never, GESTES as never) as Faux;
  const bouton = [...racine.descendants()].find((n) => /add a server/i.test(n.textContent) && typeof n.click === "function") ?? assert.fail("no `add a server`");
  bouton.click();
  const texte = [...racine.descendants()].map((n) => n.textContent).join("\n");
  assert.match(texte, ONE_LINER, "the panel shows no one-liner");
  assert.doesNotMatch(texte, /installation-station/i);
  const commandes = texte.split("\n").filter((ligne) => /^\s*(sudo |ssh |curl |apt|npm |sh )/.test(ligne));
  for (const ligne of commandes) assert.match(ligne, ONE_LINER);
});
