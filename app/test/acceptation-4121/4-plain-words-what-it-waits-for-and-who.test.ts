// Test d'acceptation gelé (#4121). Critère 4 : pour #221 et chaque bandeau, ce qu'il attend vraiment et qui il attend, en mots simples.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROLE_DU_SECOND } from "../../src/second/lancement.ts";
import { contexteDuBlocage } from "../../src/second/contexte-du-blocage.ts";

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

test("for #221 and each banner the context gives what it really waits for and who it waits on", () => {
  const contexte = contexteDuBlocage(QUESTION, VUE);
  for (const banniere of VUE.banners) {
    assert.ok(contexte.includes(banniere.waitsFor), `says what ${banniere.label} waits for`);
    assert.ok(contexte.includes(banniere.waitsOn), `says who ${banniere.label} waits on`);
  }
  assert.ok(contexte.includes(VUE.rail[0]!.real), "says what #221 really waits for");
  assert.ok(contexte.includes(VUE.rail[0]!.waitsOn), "says who #221 waits on");
  assert.match(readFileSync(ROLE_DU_SECOND, "utf8"), /plain words[^\n]*(waits? (for|on)|who)/i);
});
