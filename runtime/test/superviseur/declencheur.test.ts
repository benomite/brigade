// Le déclencheur du superviseur (#3943) : il se réveille dans chacun de ses
// trois cas, et pas juste sous chaque seuil (29 min, 2 prises, 9 min).
import assert from "node:assert/strict";
import { test } from "node:test";
import { reveil, type FaitsDuProjet } from "../../src/superviseur/declencheur.ts";

const T0 = Date.parse("2026-11-20T10:00:00.000Z");
const a = (minutes: number) => new Date(T0 + minutes * 60_000);
const iso = (minutes: number) => a(minutes).toISOString();
const CALME: FaitsDuProjet = { dernierMerge: null, cuisinables: [], prises: [], mainRougeDepuis: null };

test("rien de mergé depuis 30 min alors qu'un ticket est cuisinable : il se réveille, sur la tête des cuisinables ; à 29 min, non", () => {
  const faits = { ...CALME, dernierMerge: iso(0), cuisinables: [{ ticket: 17, depuis: iso(-60) }, { ticket: 18, depuis: iso(-90) }] };
  assert.deepEqual(reveil(faits, a(30)), { cause: "no-merge", since: iso(0), ticket: 17 });
  assert.equal(reveil(faits, a(29)), null);
});

test("le compte des 30 min part du plus ancien cuisinable quand il attend depuis moins longtemps que le dernier merge", () => {
  const faits = { ...CALME, dernierMerge: iso(-120), cuisinables: [{ ticket: 17, depuis: iso(5) }, { ticket: 18, depuis: iso(0) }] };
  assert.equal(reveil(faits, a(29)), null);
  assert.deepEqual(reveil(faits, a(30)), { cause: "no-merge", since: iso(0), ticket: 17 });
});

test("aucun merge connu : le compte part du plus ancien cuisinable ; aucun instant lisible, il ne se réveille pas", () => {
  assert.deepEqual(reveil({ ...CALME, cuisinables: [{ ticket: 17, depuis: iso(0) }] }, a(30)), { cause: "no-merge", since: iso(0), ticket: 17 });
  assert.equal(reveil({ ...CALME, cuisinables: [{ ticket: 17, depuis: "illisible" }] }, a(600)), null);
});

test("rien de mergé depuis des heures, mais aucun ticket cuisinable : il ne se réveille pas", () => {
  assert.equal(reveil({ ...CALME, dernierMerge: iso(-600) }, a(0)), null);
});

test("un ticket pris 3 fois sans livrer : il se réveille sur ce ticket ; pris 2 fois, non", () => {
  assert.deepEqual(reveil({ ...CALME, prises: [{ ticket: 20, prises: 1 }, { ticket: 21, prises: 3 }] }, a(0)), { cause: "takes", takes: 3, ticket: 21 });
  assert.equal(reveil({ ...CALME, prises: [{ ticket: 20, prises: 1 }, { ticket: 21, prises: 2 }] }, a(0)), null);
});

test("main rouge depuis 10 min : il se réveille, sans ticket en faute ; depuis 9 min, non", () => {
  const faits = { ...CALME, mainRougeDepuis: iso(0) };
  assert.deepEqual(reveil(faits, a(10)), { cause: "main-red", since: iso(0), ticket: null });
  assert.equal(reveil(faits, a(9)), null);
});

test("plusieurs causes tiennent : main rouge, puis le ticket pris sans livrer, puis le rail sans merge", () => {
  const tout = { dernierMerge: iso(-60), cuisinables: [{ ticket: 17, depuis: iso(-60) }], prises: [{ ticket: 21, prises: 3 }], mainRougeDepuis: iso(-10) };
  assert.equal(reveil(tout, a(0))?.cause, "main-red");
  assert.equal(reveil({ ...tout, mainRougeDepuis: null }, a(0))?.cause, "takes");
  assert.equal(reveil({ ...tout, mainRougeDepuis: null, prises: [] }, a(0))?.cause, "no-merge");
});
