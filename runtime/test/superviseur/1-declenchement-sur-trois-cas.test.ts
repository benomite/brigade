// #3914, critère 1 : le superviseur se déclenche sur un projet dans trois cas — rien de livré depuis 30 min alors qu'un
// ticket est cuisinable, un ticket pris 3 fois sans livrer, main rouge depuis 10 min — et pas en dessous de chaque seuil.
import assert from "node:assert/strict";
import { test } from "node:test";
import { declencher, type Observation } from "../../src/superviseur/declenchement.ts";

const MAINTENANT = new Date("2026-11-20T12:00:00.000Z");
const ilYa = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
const CALME: Observation = { dernierMerge: ilYa(5), ticketCuisinable: true, prises: [{ ticket: 7, prises: 2 }], baseRougeDepuis: null };

test("the supervisor triggers when nothing was merged for 30 min while a ticket is cookable, not below", () => {
  const declenche = declencher({ ...CALME, dernierMerge: ilYa(30) }, MAINTENANT);
  assert.equal(declenche?.cause, "rien-livre");
  assert.equal(declencher({ ...CALME, dernierMerge: ilYa(29) }, MAINTENANT), null);
  assert.equal(declencher({ ...CALME, dernierMerge: ilYa(300), ticketCuisinable: false }, MAINTENANT), null, "no cookable ticket, nothing to do");
});

test("the supervisor triggers when a ticket was taken 3 times without delivering, not below", () => {
  const declenche = declencher({ ...CALME, prises: [{ ticket: 7, prises: 3 }] }, MAINTENANT);
  assert.equal(declenche?.cause, "prises-sans-livraison");
  assert.equal(declenche?.ticket, 7);
  assert.equal(declencher({ ...CALME, prises: [{ ticket: 7, prises: 2 }] }, MAINTENANT), null);
});

test("the supervisor triggers when main was red for 10 min, not below", () => {
  assert.equal(declencher({ ...CALME, baseRougeDepuis: ilYa(10) }, MAINTENANT)?.cause, "base-rouge");
  assert.equal(declencher({ ...CALME, baseRougeDepuis: ilYa(9) }, MAINTENANT), null);
});
