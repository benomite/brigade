// Critère 2 de #3815 : tant qu'un ticket de réparation existe, le planificateur
// le prend avant tout autre, et la retenue de la base rouge ne le bloque pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("while a repair ticket exists the scheduler picks it before any other ticket, and the red base neither blocks its cook nor its merge", async () => {
  const faux = new FauxGitHub();
  faux.feu(5);
  faux.feu(9, [...CALIBRE, "repair-main"], "Repair main: the failing test");
  faux.ticket(9).title = "Repair main: parses the clock";
  faux.base = "red";
  const a = faux.station("A", { places: 1, avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.equal(faux.cuissons[0]?.issue, 9);
  await a.tour();
  await a.tour();
  assert.equal(faux.mergee(9)?.mergeePar, "A");
  assert.equal(faux.mergee(5), undefined);
  assert.deepEqual(faux.creations, []);
});
