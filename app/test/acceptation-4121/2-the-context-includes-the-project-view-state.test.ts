// Test d'acceptation gelé (#4121). Critère 2 : le contexte du second porte l'état de la vue du projet (bandeaux, cartes du rail, état affiché).
import assert from "node:assert/strict";
import { test } from "node:test";
import { contextDuBlockage } from "../../src/second/context-du-blockage.ts";

const QUESTION = "pourquoi on est bloqués ?";
const VUE = {
  banners: [
    { label: "STOPPED", waitsFor: "the station was stopped and nobody restarted it", waitsOn: "the chef" },
    { label: "FAULT #221", waitsFor: "the cook of #221 crashed on the same error twice", waitsOn: "the chef, who reads the fault" },
  ],
  rail: [
    {
      number: 221,
      title: "Espace: sync the board",
      displayed: "queued - ready, waits for a place in the kitchen",
      real: "cannot start: it depends on #1078, which is not on the rail and cannot be put in WAITING",
      waitsOn: "the manager, who puts #1078 back on the rail",
    },
  ],
  offRail: [{ number: 1078, title: "Espace: WAITING refuses the label" }],
};

test("the context shows both banners and card #221 with its displayed state", () => {
  const context = contextDuBlockage(QUESTION, VUE);
  assert.match(context, /STOPPED/);
  assert.match(context, /FAULT #221/);
  assert.match(context, /#221/);
  assert.match(context, /Espace: sync the board/);
  assert.match(context, /queued - ready, waits for a place in the kitchen/);
});
