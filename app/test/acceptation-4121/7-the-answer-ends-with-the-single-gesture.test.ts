// Test d'acceptation gelé (#4121). Critère 7 : la réponse finit par l'unique geste qui débloque et qui le fait ; sans geste, elle le dit.
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

test("the second ends with the single unblocking gesture and who makes it, or says there is none", () => {
  const role = readFileSync(ROLE_DU_SECOND, "utf8");
  assert.match(role, /end[^\n]*(single|one) gesture[^\n]*who/i);
  assert.match(role, /no gesture[^\n]*(say so|never invent)/i);
  // without a known gesture the context says so instead of inventing one
  const sans = contextDuBlockage(QUESTION, { ...VUE, gesture: undefined });
  assert.match(sans, /no gesture/i);
  // with one, it is given once, with its maker
  const avec = contextDuBlockage(QUESTION, { ...VUE, gesture: { what: "put #1078 back on the rail", by: "the manager" } });
  assert.match(avec, /put #1078 back on the rail/);
  assert.match(avec, /the manager/);
});
