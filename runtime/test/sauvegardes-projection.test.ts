// La dernière sauvegarde réussie, telle que le journal la raconte.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { derniereSauvegarde } from "../src/projections/sauvegardes.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const sauvegarder = (name: string, lastSeq: number) =>
    journal.ajouter({ project: "brigade", ticket: null, author: "sauvegarde", type: "backup.completed", payload: { name, lastSeq, events: lastSeq, streams: 0 } });
  return { base: journal.base, sauvegarder };
}

test("un projet jamais sauvegardé n'a pas de dernière sauvegarde", (t) => {
  assert.equal(derniereSauvegarde(cuisine(t).base), null);
});

test("la dernière sauvegarde se lit avec sa date, son nom et l'événement jusqu'où elle va ; la suivante la remplace", (t) => {
  const { base, sauvegarder } = cuisine(t);
  sauvegarder("2026-10-07T03-30-00Z", 3);

  assert.deepEqual(derniereSauvegarde(base), { at: "2026-10-08T10:00:00.000Z", name: "2026-10-07T03-30-00Z", lastSeq: 3 });

  sauvegarder("2026-10-08T03-30-00Z", 9);

  assert.deepEqual(derniereSauvegarde(base), { at: "2026-10-08T10:00:01.000Z", name: "2026-10-08T03-30-00Z", lastSeq: 9 });
});
