// Test d'acceptation gelé (#4121). Critère 6 : les tickets hors de la vue (#1078) ne viennent qu'après les items de la vue, et seulement s'ils comptent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROLE_OF_SECOND } from "../../src/second/launch.ts";
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

test("#1078 is absent or comes after every view item", () => {
  const context = contextOfBlockage(QUESTION, VUE);
  const rank = context.indexOf("#1078");
  if (rank >= 0) {
    for (const motive of ["STOPPED", "FAULT #221", "queued - ready, waits for a place in the kitchen"]) {
      assert.ok(context.indexOf(motive) >= 0 && context.indexOf(motive) < rank, `${motive} comes before #1078`);
    }
  }
  // with nothing off the rail that matters, none is invented
  assert.ok(!contextOfBlockage(QUESTION, { ...VUE, offRail: [], rail: [{ ...VUE.rail[0]!, real: "cannot start", waitsOn: "the manager" }] }).includes("#1078"));
  assert.match(readFileSync(ROLE_OF_SECOND, "utf8"), /not on the (project )?view[^\n]*(after|only)/i);
});
