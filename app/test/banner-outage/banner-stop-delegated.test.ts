// #4216 : le bandeau de l'arrêt (banner-stop.js) rend un statut `{ state, cause, action }` par vue/banner-outage/, et le clic de son bouton appelle `reparer`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mountTheBanner } from "../../src/vue/banner-stop/banner-stop.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

test("a fault status given to the stop banner shows its button, and a click repairs with the id", () => {
  const host = new Fake("div");
  const calls: string[] = [];
  mountTheBanner(doc, host, { ouvrirTicket() {}, ouvrirLesChecks() {}, relire() {}, reparer: (id: string) => void calls.push(id) })
    .maj({ state: "fault", cause: "main is red", action: { kind: "button", label: "Fix main", id: "fix-main" } });
  const buttons = [...host.descendants()].filter(({ balise }) => balise === "button");
  assert.equal(buttons.length, 1);
  buttons[0]?.click();
  assert.deepEqual(calls, ["fix-main"]);
});
