// Les événements des tickets mergés (#4299), tirés des enregistrements de `temps-tickets.json` : la prise, le merge, et les phases rangées en parts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { evenementsDesTemps } from "../../src/delais/evenements.ts";
import { decomposer } from "../../src/delais/mesure.ts";
import { ENREGISTREMENTS, t } from "./jeu.ts";

test("the claim is the one the issue carries, the phases are laid end to end from the filing and sorted into the five parts", () => {
  const [rapide, lent] = evenementsDesTemps(ENREGISTREMENTS);
  assert.equal(rapide?.pris, t(4));
  assert.equal(rapide?.fusionne, t(12));
  assert.deepEqual(lent?.phases.map(({ type }) => type), ["wait", "wait", "cook", "gates", "review", "send-back", "wait", "wait"]);
  assert.deepEqual(decomposer(lent ?? assert.fail()), { totalMin: 25, parts: { cook: 10, gates: 5, review: 4, "send-back": 3, wait: 3 } });
  assert.deepEqual(decomposer(rapide ?? assert.fail()), { totalMin: 8, parts: { cook: 5, gates: 1, review: 2, "send-back": 0, wait: 0 } });
});

test("without the claim on the issue, the first phase the station saw is the claim; failed cooks are cook time", () => {
  const [e] = evenementsDesTemps([{ ...ENREGISTREMENTS[0], priseAt: null, phases: [{ nom: "claim wait", minutes: 5 }, { nom: "failed cook", minutes: 2 }, { nom: "cooking", minutes: 5 }] }]);
  assert.equal(e?.pris, t(5));
  assert.deepEqual(decomposer(e ?? assert.fail()).parts, { cook: 7, gates: 0, review: 0, "send-back": 0, wait: 0 });
});

test("a record without claim or merge is left out; one measured before #2662 has its time and no phase; a negative phase drops them all", () => {
  const { phases: _, depuis: __, ...ancien } = ENREGISTREMENTS[1] ?? assert.fail();
  const evenements = evenementsDesTemps([
    null,
    { ticket: 7 },
    { ...ENREGISTREMENTS[0], mergedAt: "never" },
    { ...ENREGISTREMENTS[0], ticket: 1.5 },
    ancien,
    { ...ENREGISTREMENTS[0], ticket: 9, phases: [{ nom: "cooking", minutes: 3 }, { nom: "review", minutes: -1 }] },
  ]);
  assert.deepEqual(evenements, [
    { ticket: 2, pris: t(4), fusionne: t(29), phases: [] },
    { ticket: 9, pris: t(4), fusionne: t(12), phases: [] },
  ]);
});
