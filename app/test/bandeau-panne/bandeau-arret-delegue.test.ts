// #4216 : le bandeau de l'arrêt (bandeau-arret.js) rend un statut `{ state, cause, action }` par vue/bandeau-panne/, et le clic de son bouton appelle `reparer`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { monterLeBandeau } from "../../src/vue/bandeau-arret/bandeau-arret.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

test("a fault status given to the stop banner shows its button, and a click repairs with the id", () => {
  const hote = new Faux("div");
  const appels: string[] = [];
  monterLeBandeau(doc, hote, { ouvrirTicket() {}, ouvrirLesChecks() {}, relire() {}, reparer: (id: string) => void appels.push(id) })
    .maj({ state: "fault", cause: "main is red", action: { kind: "button", label: "Fix main", id: "fix-main" } });
  const boutons = [...hote.descendants()].filter(({ balise }) => balise === "button");
  assert.equal(boutons.length, 1);
  boutons[0]?.click();
  assert.deepEqual(appels, ["fix-main"]);
});

test("a fault button clicked without any repair call does nothing and does not throw", () => {
  const hote = new Faux("div");
  monterLeBandeau(doc, hote).maj({ state: "fault", cause: "main is red", action: { kind: "button", label: "Fix main", id: "fix-main" } });
  [...hote.descendants()].find(({ balise }) => balise === "button")?.click();
});
