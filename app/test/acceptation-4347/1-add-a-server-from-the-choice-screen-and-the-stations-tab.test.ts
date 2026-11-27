// Test d'acceptation (#4347), critère 1 : de l'écran du choix de machine (projet sans station) comme de l'onglet Stations,
// le chef atteint « add a server » ; la page du guide nomme chaque écran touché et ne dit plus que la connexion d'une station
// de serveur ne part pas de l'app.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setTheTabOfStations } from "../../src/vue/stations-tab/stations-tab.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const ACTIONS = { choisirQuiCuit() {}, deplacer() {}, versIci() {}, cuireIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
const BASE = { projet: "parade", poste: "this Mac", lues: true, haut: { vert: false, etat: "aucune", dit: "" }, servantes: [], deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set() };
const render = (more: object) => setTheTabOfStations(doc as never, { ...BASE, ...more } as never, ACTIONS as never) as Fake;
const entry = (root: Fake) => [...root.descendants()].find((n) => /add a server/i.test(n.textContent) && n.children.length === 0);

test("a project with no station and the Stations tab both offer `add a server`; the guide names the screens", () => {
  const choice = [{ cle: "ici", nom: "this computer", horsLigne: false, recommande: false }];
  assert.ok(entry(render({ choix: { choix: choice, projet: "chef/parade" } })), "no `add a server` on the machine-choice screen");
  assert.ok(entry(render({})), "no `add a server` in the Stations tab");
  const guide = readFileSync(new URL("../../../docs/app.md", import.meta.url), "utf8");
  assert.doesNotMatch(guide, /does not yet start from the app/i);
  assert.match(guide, /add a server/i);
});
