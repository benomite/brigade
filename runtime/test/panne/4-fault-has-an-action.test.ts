// #4214, critère 4 : toute panne porte une action `done` (avec texte) ou `button` (libellé et id de réparation), jamais un texte à copier.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnostiquer } from "../../src/outage/index.ts";

const sain = { rail: { mainRouge: false, boucleDeRelance: false }, stations: [{ nom: "A", enMarche: true }], tickets: [{ numero: 1, labels: ["fire"], decisionOuverte: false, enAttente: false }] };
const entrees = [
  { ...sain, rail: { mainRouge: true, boucleDeRelance: false } },
  { ...sain, rail: { mainRouge: false, boucleDeRelance: true } },
  { ...sain, stations: [{ nom: "A", enMarche: false }] },
  { ...sain, tickets: [{ numero: 1, labels: ["fire"], decisionOuverte: true, enAttente: false }] },
  { ...sain, tickets: [{ numero: 1, labels: ["fire"], decisionOuverte: false, enAttente: true }] },
];

test("every fault carries a done or button action, and no action is bare text", () => {
  let pannes = 0;
  for (const entree of entrees) {
    const r = diagnostiquer(entree as never);
    if (r.action !== null) {
      assert.ok(r.action.kind === "done" || r.action.kind === "button", "action kind");
      if (r.action.kind === "done") assert.ok(typeof r.action.text === "string" && r.action.text.length > 0);
      else {
        assert.ok(r.action.label.length > 0, "button label");
        assert.ok(r.action.id.length > 0, "repair id");
      }
    }
    if (r.state === "fault") {
      pannes += 1;
      assert.ok(r.action !== null, `fault "${r.cause}" has an action`);
    }
  }
  assert.ok(pannes >= 3, "the red main, the loop and the down station are faults");
});
