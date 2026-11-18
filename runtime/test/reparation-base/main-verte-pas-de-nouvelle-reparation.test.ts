// Critère 4 de #3815 : main est verte, aucune réparation ne naît, et les
// réparations ouvertes sont fermées ou laissées finir.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("when main is green again no repair ticket is created, and each open repair ticket is closed or left to finish", async () => {
  const faux = new FauxGitHub();
  faux.feu(30, [...CALIBRE, "repair-main"], "Repair main: the failing test, nobody on it");
  faux.feu(31, [...CALIBRE, "repair-main", LABEL_TAKEN], "Repair main: the failing test, a cook on it");
  faux.base = "green";
  const a = faux.station("A", { places: 0, avertir: () => {} });
  await a.tour();
  await a.tour();
  assert.deepEqual(faux.creations, []);
  const repairs = [...faux.tickets.values()].filter((ticket) => ticket.labels.has("repair-main"));
  assert.equal(repairs.length, 2);
  for (const ticket of repairs) assert.ok(ticket.state === "closed" || ticket.labels.has(LABEL_TAKEN) || ticket.labels.has(LABEL_IN_PASS), `#${ticket.number} is neither closed nor being finished`);
  assert.equal(faux.ticket(30).state, "closed");
});
