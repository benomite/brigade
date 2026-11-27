// Test d'acceptation gelé (#4121). Critère 1 : la fixture reproduit l'état d'espace du 2026-11-24.
import assert from "node:assert/strict";
import { test } from "node:test";
// The context the app gives the second for a "why are we blocked" question: app/src/second/context-of-blockage.ts
// exports `contexteDuBlocage(question, vue)`, which returns the text the second reads (view items first, then off-rail tickets).
import { contextOfBlockage } from "../../src/second/context-of-blockage.ts";

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

test("the fixture: #221 queued-ready, banners STOPPED and FAULT #221, #1078 off the rail, the question asked", () => {
  assert.equal(QUESTION, "pourquoi on est bloqués ?");
  assert.deepEqual(VUE.banners.map((b) => b.label), ["STOPPED", "FAULT #221"]);
  assert.deepEqual(VUE.rail.map((c) => c.number), [221]);
  assert.equal(VUE.rail[0]!.displayed, "queued - ready, waits for a place in the kitchen");
  assert.ok(!VUE.rail.some((c) => c.number === 1078));
  // and the app can build the second's context from it
  assert.equal(typeof contextOfBlockage(QUESTION, VUE), "string");
});
