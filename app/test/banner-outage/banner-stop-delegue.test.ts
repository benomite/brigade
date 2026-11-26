// #4216 : le bandeau de l'arrêt (banner-stop.js) rend un statut `{ state, cause, action }` par vue/banner-outage/, et le clic de son bouton appelle `reparer`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { monterLeBanner } from "../../src/vue/banner-stop/banner-stop.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

test("a fault status given to the stop banner shows its button, and a click repairs with the id", () => {
  const hote = new Faux("div");
  const calls: string[] = [];
  monterLeBanner(doc, hote, { ouvrirTicket() {}, ouvrirLesChecks() {}, relire() {}, reparer: (id: string) => void calls.push(id) })
    .maj({ state: "fault", cause: "main is red", action: { kind: "button", label: "Fix main", id: "fix-main" } });
  const boutons = [...hote.descendants()].filter(({ balise }) => balise === "button");
  assert.equal(boutons.length, 1);
  boutons[0]?.click();
  assert.deepEqual(calls, ["fix-main"]);
});
