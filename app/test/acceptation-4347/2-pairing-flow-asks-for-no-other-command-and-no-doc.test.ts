// Test d'acceptation (#4347), critère 2 : le parcours d'appairage ne demande jamais de taper sur le serveur une autre
// commande que la ligne montrée, ni d'ouvrir `docs/installation-station.md`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTheTabOfStations } from "../../src/vue/stations-tab/stations-tab.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const ACTIONS = { choisirQuiCuit() {}, deplacer() {}, versIci() {}, cuireIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
const BASE = { projet: "parade", poste: "this Mac", lues: true, haut: { vert: false, etat: "aucune", dit: "" }, servantes: [], deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set() };
const ONE_LINER = /curl -fsSL https:\/\/github\.com\/benomite\/brigade\/releases\/download\/station\/installer-station\.sh \| sh/;

test("the `add a server` screens show the one-liner and never point to installation-station.md or another command", () => {
  const root = setTheTabOfStations(doc as never, BASE as never, ACTIONS as never) as Fake;
  const button = [...root.descendants()].find((n) => /add a server/i.test(n.textContent) && typeof n.click === "function") ?? assert.fail("no `add a server`");
  button.click();
  const text = [...root.descendants()].map((n) => n.textContent).join("\n");
  assert.match(text, ONE_LINER, "the panel shows no one-liner");
  assert.doesNotMatch(text, /installation-station/i);
  const commands = text.split("\n").filter((line) => /^\s*(sudo |ssh |curl |apt|npm |sh )/.test(line));
  for (const line of commands) assert.match(line, ONE_LINER);
});
