// Test d'acceptation gelé (#4121). Critère 5 : quand l'état affiché contredit le réel, une ligne le dit, puis l'état vrai.
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

test("the contradiction is said in one line, then the true state follows", () => {
  const lines = contextOfBlockage(QUESTION, VUE).split("\n");
  const rank = lines.findIndex((l) => /#221/.test(l) && /ready/.test(l) && /(contradict|not actually|but)/i.test(l) && /cannot start|unable to start/i.test(l));
  assert.ok(rank >= 0, "one line says #221 is shown ready but cannot start");
  assert.ok(lines.slice(rank + 1).some((l) => l.includes(VUE.rail[0]!.real)), "the true state follows");
  assert.match(readFileSync(ROLE_OF_SECOND, "utf8"), /displayed state[^\n]*(contradict|differs)[^\n]*one line/i);
});
