// Test d'acceptation gelé (#4121). Critère 3 : #221 (avec son titre) et les deux bandeaux viennent avant toute mention de #1078.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROLE_DU_SECOND } from "../../src/second/launch.ts";
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

test("first mention of #221, its title, STOPPED and FAULT #221 precedes the first mention of #1078", () => {
  const context = contextDuBlockage(QUESTION, VUE);
  const first1078 = context.indexOf("#1078");
  for (const motif of ["#221", "Espace: sync the board", "STOPPED", "FAULT #221"]) {
    const rang = context.indexOf(motif);
    assert.ok(rang >= 0, `${motif} is in the context`);
    assert.ok(first1078 < 0 || rang < first1078, `${motif} comes before #1078`);
  }
  // the role tells the second to answer in that order
  const role = readFileSync(ROLE_DU_SECOND, "utf8");
  assert.match(role, /why are we blocked|what is happening/i);
  assert.match(role, /(project view|banners?)[^\n]*(first|before)/i);
});
