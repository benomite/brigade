import assert from "node:assert/strict";
import { test } from "node:test";
import { calibrage, manquant, toucheLaVue } from "../src/calibrage.ts";

test("le calibrage d'un ticket se lit dans ses labels", () => {
  assert.deepEqual(calibrage(["fire", "model:sonnet", "effort:medium", "prio:1"]), { model: "sonnet", effort: "medium" });
  assert.deepEqual(calibrage(["model:opus", "effort:xhigh"]), { model: "opus", effort: "xhigh" });
});

test("sans label, ou avec une valeur hors liste, la dimension n'est pas calibrée", () => {
  assert.deepEqual(calibrage(["fire"]), { model: null, effort: null });
  assert.deepEqual(calibrage(["model:haiku"]), { model: "haiku", effort: null });
  assert.deepEqual(calibrage(["model:gpt-5", "effort:énorme"]), { model: null, effort: null });
  assert.deepEqual(calibrage(["model:", "effort:HIGH"]), { model: null, effort: null });
});

test("deux labels pour une même dimension : ambigu, donc non calibré", () => {
  assert.deepEqual(calibrage(["model:opus", "model:haiku", "effort:low"]), { model: null, effort: "low" });
  assert.deepEqual(calibrage(["model:opus", "model:gpt-5", "effort:low", "effort:low"]), { model: null, effort: null });
});

test("ce qui manque à un calibrage se dit en clair, pour le chef", () => {
  assert.equal(manquant({ model: "opus", effort: "low" }), null);
  assert.match(manquant({ model: null, effort: "low" }) ?? "", /model:<opus\|sonnet\|haiku>/);
  assert.doesNotMatch(manquant({ model: null, effort: "low" }) ?? "", /effort:/);
  assert.match(manquant({ model: null, effort: null }) ?? "", /model:<.*effort:<low\|medium\|high\|xhigh\|max>/);
});

test("une zone touche la vue de l'app quand elle la nomme, nomme un chemin dessous, ou un dossier qui la contient", () => {
  for (const zone of [["app/src/vue"], ["app/src/vue/carte.js"], ["app/src"], ["app"], ["runtime/src", "app/src/vue/jetons.css"]]) assert.equal(toucheLaVue(zone), true, zone.join(", "));
  for (const zone of [["runtime/src"], ["docs/maquettes/app"], ["scripts/capture-ecran"], ["app/src/service.ts"], ["app/src/vue2"], ["app/test"], []]) assert.equal(toucheLaVue(zone), false, zone.join(", "));
});
