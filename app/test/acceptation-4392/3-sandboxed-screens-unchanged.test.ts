// #4392 : les écrans d'une station avec bac à sable sont inchangés.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etatDOnboarding, type Entrees } from "../../../runtime/src/onboarding/etat.ts";

const WITH_BAC: Entrees = {
  projet: "gadgets",
  depot: "ACME-tech/gadgets",
  station: "macbook",
  suivi: { etat: "servi", dit: "served by macbook", autoriser: [] },
  clone: true,
  sansBacASable: false,
  decision: null,
  preparation: null,
  premierTicket: null,
  dejaServi: false,
};

// brigade:guard
test("avec bac à sable, l'étape de la machine ne dit rien du mode restreint et garde ses phrases", () => {
  const machine = (entries: Entrees) => etatDOnboarding(entries).etapes.find(({ etape: step }) => step === "machine");
  assert.equal(machine(WITH_BAC)?.dit, "macbook cooks gadgets.");
  assert.equal(machine({ ...WITH_BAC, suivi: null })?.dit, "macbook is opening the kitchen of gadgets.");
  assert.equal(etatDOnboarding(WITH_BAC).decisionAttendue, false);
  assert.doesNotMatch(JSON.stringify(etatDOnboarding(WITH_BAC)), /restricted mode|no sandbox/i);
});
