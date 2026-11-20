// Le déclenchement du superviseur et son dossier (#3914), au-delà des critères gelés : la cause que chaque
// déclenchement dit, le check rouge qui le porte, le premier ticket qui boucle, et un dossier dont une lecture manque.
import assert from "node:assert/strict";
import { test } from "node:test";
import { declencher, direDeclenchement, estInformatif, type Observation } from "../../src/superviseur/declenchement.ts";
import { composerDossier, type LecturesDuDossier } from "../../src/superviseur/dossier.ts";

const MAINTENANT = new Date("2026-11-20T12:00:00.000Z");
const ilYa = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
const CALME: Observation = { dernierMerge: ilYa(5), ticketCuisinable: true, prises: [], baseRougeDepuis: null };

test("a red main names its first red check, and only when there is one", () => {
  assert.deepEqual(declencher({ ...CALME, baseRougeDepuis: ilYa(12), checksRouges: ["unit", "lint"] }, MAINTENANT), { cause: "base-rouge", check: "unit" });
  assert.deepEqual(declencher({ ...CALME, baseRougeDepuis: ilYa(12) }, MAINTENANT), { cause: "base-rouge" });
});

test("the first ticket of the rail taken three times is the one at fault", () => {
  assert.deepEqual(declencher({ ...CALME, prises: [{ ticket: 4, prises: 1 }, { ticket: 9, prises: 4 }, { ticket: 2, prises: 3 }] }, MAINTENANT), { cause: "prises-sans-livraison", ticket: 9 });
});

test("with no merge seen, the count of nothing merged starts at the opening, and nothing counts without either", () => {
  assert.deepEqual(declencher({ ...CALME, dernierMerge: null, ouverture: ilYa(31) }, MAINTENANT), { cause: "rien-livre" });
  assert.equal(declencher({ ...CALME, dernierMerge: null, ouverture: ilYa(29) }, MAINTENANT), null);
  assert.equal(declencher({ ...CALME, dernierMerge: null }, MAINTENANT), null);
});

test("each trigger says what it saw, in one English line", () => {
  assert.equal(direDeclenchement({ cause: "base-rouge", check: "unit" }), "main has been red for 10 min (check `unit`)");
  assert.equal(direDeclenchement({ cause: "base-rouge" }), "main has been red for 10 min");
  assert.equal(direDeclenchement({ cause: "prises-sans-livraison", ticket: 9 }), "#9 was taken 3 times without delivering");
  assert.equal(direDeclenchement({ cause: "rien-livre" }), "nothing merged for 30 min while a ticket is cookable");
});

test("only the Windows test jobs are informative", () => {
  assert.equal(estInformatif({ name: "windows tests (2/8)" }), true);
  assert.equal(estInformatif({ name: "Windows app tests" }), true);
  assert.equal(estInformatif({ name: "windows" }), false);
  assert.equal(estInformatif({}), false);
});

const LECTURES: LecturesDuDossier = {
  file: async () => [{ ticket: 41, titre: "Forty-one", ligne: "#41 is claimable but not claimed, the claim gate skipped it: zone held by #40" }, { ticket: 43, titre: "Forty-three" }],
  queueDuJournal: async () => [],
  etapeEnEchec: async () => null,
  historique: async () => [],
};

test("the dossier says what triggered the run, why each queued ticket was skipped, and what could not be read — the run goes on", async () => {
  const dossier = await composerDossier({
    lectures: { ...LECTURES, queueDuJournal: async () => Promise.reject(new Error("the journal is locked")), historique: async () => Promise.reject(new Error("HTTP 502")) },
    ticketFautif: 7,
    vu: "#7 was taken 3 times without delivering",
  });
  assert.match(dossier.texte, /^## What triggered this run\n\n#7 was taken 3 times without delivering\n/);
  assert.match(dossier.texte, /- #41 Forty-one — #41 is claimable but not claimed, the claim gate skipped it: zone held by #40\n- #43 Forty-three\n/);
  assert.deepEqual(dossier.manques, ["the journal could not be read: the journal is locked", "the history of #7 could not be read: HTTP 502"]);
  assert.match(dossier.texte, /## What could not be read\n\n- the journal could not be read: the journal is locked\n- the history of #7 could not be read: HTTP 502/);
  assert.match(dossier.texte, /## The history of #7\n\n\(empty\)/);
  assert.deepEqual(dossier.journal, []);
});

test("a dossier with nothing missing, and no ticket at fault, says neither", async () => {
  const dossier = await composerDossier({ lectures: LECTURES, ticketFautif: null });
  assert.doesNotMatch(dossier.texte, /What triggered|What could not be read|The history of/);
  assert.match(dossier.texte, /## The failing CI step on main\n\n\(none\)/);
  assert.match(dossier.texte, /## The tail of the journal \(last 50 lines\)\n\n\(empty\)/);
});
